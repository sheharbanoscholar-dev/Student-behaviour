"""
Pipeline: Person tracking (YOLO + ByteTrack) + Face recognition (InsightFace + gallery)
+ Behavior (bestX.pt) → output "Ali – sleeping", etc.
Requires: run build_gallery.py first to create students_gallery.pkl
"""
import csv
import pickle
import warnings
from collections import Counter, deque
from pathlib import Path

# Suppress InsightFace's FutureWarning (scikit-image estimate deprecation)
warnings.filterwarnings("ignore", category=FutureWarning, module="insightface.utils.face_align")

import cv2
import numpy as np
import torch

# --------------- Paths (edit as needed) ---------------
BASE_DIR = Path(__file__).resolve().parent
VIDEO_PATH = BASE_DIR / "demo.mp4"
OUTPUT_VIDEO = BASE_DIR / "output_demo.mp4"
BEHAVIOR_WEIGHTS = BASE_DIR / "bestX.pt"
PERSON_MODEL = "yolov8n.pt"  # COCO person; downloads if missing
GALLERY_PATH = BASE_DIR / "students_gallery.pkl"
BEHAVIOR_LOG_CSV = BASE_DIR / "behavior_log.csv"

SECONDS_TO_PROCESS = 20 # set to None to process full video

# --------------- Behavior model (same as test_yolo_on_video) ---------------
CONF_BY_CLASS = {
    "hand_raising": 0.25,
    "looking_away": 0.25,
    "looking_board": 0.25,
    "mobile_use": 0.25,
    "reading": 0.25,
    "sleeping": 0.25,
    "writing": 0.25,
}
DEFAULT_CONF = 0.25

# --------------- Face / tracking params ---------------
FACE_MATCH_THRESHOLD = 0.4   # cosine similarity above this → assign name
VOTE_BUFFER_SIZE = 10       # majority vote over last N recognitions per track
MIN_IOU_BEHAVIOR_PERSON = 0.1  # min IoU to assign behavior to a person track
PERSON_CONF = 0.4           # person detection confidence
FACE_MODEL_NAME = "buffalo_l"
# Run face recognition only every N frames per track (big speedup on CPU; 1 = every frame)
FACE_REC_INTERVAL = 5
# Use GPU for InsightFace if available (set False to force CPU)
USE_GPU_FACE = True

# --------------- Temporal behavior (smoothing + minimum duration) ---------------
SMOOTH_WINDOW_SEC = 2.0   # Look back this many seconds for majority-vote smoothing
MIN_DURATION_SEC = 0.5    # Only report/show behavior when it has lasted at least this long (lower = more detections, more noise)

# COCO class 0 = person
COCO_PERSON_CLASS = 0


def filter_behavior_by_class_conf(results, model, conf_by_class, default_conf):
    """Keep only behavior detections above class-specific confidence."""
    if results[0].boxes is None or len(results[0].boxes) == 0:
        return results
    boxes = results[0].boxes
    names = model.names
    keep = []
    for i in range(len(boxes)):
        cls_idx = int(boxes.cls[i].item())
        conf = float(boxes.conf[i].item())
        if isinstance(names, (list, tuple)):
            name = names[cls_idx] if 0 <= cls_idx < len(names) else f"class_{cls_idx}"
        else:
            name = names.get(cls_idx, f"class_{cls_idx}")
        thresh = conf_by_class.get(name, default_conf)
        if conf >= thresh:
            keep.append(i)
    if not keep:
        results[0].boxes = None
        return results
    keep_t = torch.tensor(keep, device=boxes.cls.device, dtype=torch.long)
    results[0].boxes = boxes[keep_t]
    return results


def box_iou(a, b):
    """IoU of two boxes (x1, y1, x2, y2)."""
    ax1, ay1, ax2, ay2 = a[0], a[1], a[2], a[3]
    bx1, by1, bx2, by2 = b[0], b[1], b[2], b[3]
    ix1 = max(ax1, bx1)
    iy1 = max(ay1, by1)
    ix2 = min(ax2, bx2)
    iy2 = min(ay2, by2)
    if ix2 <= ix1 or iy2 <= iy1:
        return 0.0
    inter = (ix2 - ix1) * (iy2 - iy1)
    area_a = (ax2 - ax1) * (ay2 - ay1)
    area_b = (bx2 - bx1) * (by2 - by1)
    union = area_a + area_b - inter
    return inter / union if union > 0 else 0.0


def smoothed_behavior_and_duration(history, current_time_sec, window_sec):
    """
    history: list of (time_sec, behavior) in the last window_sec.
    Returns (smoothed_behavior, duration_sec). duration_sec = how long that behavior
    has been the majority in the window (from oldest occurrence of it to now).
    """
    if not history:
        return None, 0.0
    cutoff = current_time_sec - window_sec
    in_window = [(t, b) for t, b in history if t >= cutoff]
    if not in_window:
        return None, 0.0
    # Majority behavior in window
    behaviors = [b for _, b in in_window]
    smoothed = Counter(behaviors).most_common(1)[0][0]
    # Duration: from oldest (t, smoothed) in window to current_time_sec
    times_with_smoothed = [t for t, b in in_window if b == smoothed]
    duration_sec = current_time_sec - min(times_with_smoothed)
    return smoothed, max(0.0, duration_sec)


def cosine_similarity(a, b):
    """Cosine similarity (embeddings assumed normalized)."""
    return float(np.dot(a, b))


def match_embedding_to_gallery(embedding, gallery, threshold):
    """
    gallery: dict name -> list of np arrays (normed embeddings).
    Returns (best_name, score) or ("Unknown", 0.0).
    """
    if not gallery or embedding is None:
        return "Unknown", 0.0
    best_name = "Unknown"
    best_score = -1.0
    for name, embs in gallery.items():
        for emb in embs:
            s = cosine_similarity(embedding, emb)
            if s > best_score:
                best_score = s
                best_name = name
    if best_score >= threshold:
        return best_name, best_score
    return "Unknown", best_score


def main(api_base_url=None, session_id=None, internal_secret=None, progress_callback=None, progress_file_path=None):
    """Run pipeline. progress_callback(session_id, pct) or progress_file_path for progress (file = subprocess-friendly)."""
    from ultralytics import YOLO

    report_progress = (api_base_url and session_id and internal_secret) or progress_callback or progress_file_path
    last_reported_pct = -1

    def _write_progress_file(pct):
        if not progress_file_path:
            return
        try:
            path = Path(progress_file_path)
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(str(min(100, max(0, int(pct)))), encoding="utf-8")
        except Exception:
            pass

    def _report(pct):
        nonlocal last_reported_pct
        if pct <= last_reported_pct:
            return
        last_reported_pct = pct
        _write_progress_file(pct)
        if progress_callback and session_id is not None:
            try:
                progress_callback(session_id, pct)
            except Exception:
                pass
        if api_base_url and session_id and internal_secret:
            _api_patch_progress(api_base_url, session_id, internal_secret, pct)

    # Load gallery
    if not GALLERY_PATH.exists():
        print(f"Gallery not found: {GALLERY_PATH}. Run build_gallery.py first.")
        return
    with open(GALLERY_PATH, "rb") as f:
        gallery = pickle.load(f)
    print(f"Loaded gallery: {list(gallery.keys())}")
    _report(2)

    # InsightFace
    try:
        from insightface.app import FaceAnalysis
    except ImportError:
        print("Error: pip install insightface onnxruntime")
        return
    print(f"Loading InsightFace ({FACE_MODEL_NAME})...")
    if USE_GPU_FACE:
        try:
            face_app = FaceAnalysis(name=FACE_MODEL_NAME, providers=["CUDAExecutionProvider", "CPUExecutionProvider"])
            face_app.prepare(ctx_id=0, det_size=(640, 640))
            print("  Using GPU for face recognition.", flush=True)
        except Exception:
            face_app = FaceAnalysis(name=FACE_MODEL_NAME, providers=["CPUExecutionProvider"])
            face_app.prepare(ctx_id=0, det_size=(640, 640))
            print("  GPU not available, using CPU for face recognition.", flush=True)
    else:
        face_app = FaceAnalysis(name=FACE_MODEL_NAME, providers=["CPUExecutionProvider"])
        face_app.prepare(ctx_id=0, det_size=(640, 640))
    _report(5)

    # Person YOLO + ByteTrack
    print(f"Loading person model: {PERSON_MODEL}")
    person_model = YOLO(PERSON_MODEL)
    print("Loading behavior model:", BEHAVIOR_WEIGHTS)
    behavior_model = YOLO(str(BEHAVIOR_WEIGHTS))
    _report(8)

    cap = cv2.VideoCapture(str(VIDEO_PATH))
    if not cap.isOpened():
        print(f"Error: Could not open video: {VIDEO_PATH}")
        return
    _report(10)

    fps = cap.get(cv2.CAP_PROP_FPS)
    w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    duration_sec = total_frames / fps if fps > 0 else 0
    max_frames = total_frames if SECONDS_TO_PROCESS is None else min(total_frames, int(fps * SECONDS_TO_PROCESS))
    print(f"Video: {fps:.1f} FPS, {w}x{h}, processing {max_frames} frames (~{max_frames/fps:.1f}s)")
    _report(10)

    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    out = cv2.VideoWriter(str(OUTPUT_VIDEO), fourcc, fps, (w, h))

    # Per-track vote buffer: track_id -> deque of names
    track_votes = {}
    # Track id -> last known bbox (for face crop)
    track_boxes = {}
    # Temporal behavior: key (name or "track_{id}") -> list of (time_sec, behavior)
    behavior_history = {}

    log_rows = []
    frame_idx = 0
    print("Starting frame processing... (first frames are slow on CPU)", flush=True)

    while frame_idx < max_frames:
        ret, frame = cap.read()
        if not ret:
            break

        if frame_idx % 5 == 0 or frame_idx < 2:
            print(f"  Frame {frame_idx}/{max_frames}...", flush=True)
        if report_progress and max_frames > 0:
            pct = int(100 * (frame_idx + 1) / max_frames)
            if pct >= last_reported_pct + 2 or pct == 100:
                _report(pct)

        # 1) Person detection + ByteTrack
        person_results = person_model.track(
            frame,
            persist=True,
            tracker="bytetrack.yaml",
            conf=PERSON_CONF,
            classes=[COCO_PERSON_CLASS],
            verbose=False,
        )
        # 2) Extract person boxes and track_ids
        person_boxes = []  # list of (xyxy, track_id)
        if person_results[0].boxes is not None and person_results[0].boxes.id is not None:
            boxes = person_results[0].boxes
            for i in range(len(boxes)):
                xyxy = boxes.xyxy[i].cpu().numpy()
                tid = int(boxes.id[i].item())
                person_boxes.append((xyxy, tid))
                track_boxes[tid] = xyxy

        # 3) Face recognition per track → update vote buffer (every FACE_REC_INTERVAL frames to save time)
        for xyxy, track_id in person_boxes:
            run_face_rec = (
                frame_idx % FACE_REC_INTERVAL == 0
                or track_id not in track_votes
                or len(track_votes[track_id]) == 0
            )
            if not run_face_rec:
                continue
            x1, y1, x2, y2 = map(int, xyxy)
            # Expand crop slightly
            pad = 0.1
            pw = x2 - x1
            ph = y2 - y1
            x1 = max(0, x1 - int(pad * pw))
            y1 = max(0, y1 - int(pad * ph))
            x2 = min(frame.shape[1], x2 + int(pad * pw))
            y2 = min(frame.shape[0], y2 + int(pad * ph))
            crop = frame[y1:y2, x1:x2]
            if crop.size == 0:
                continue
            faces = face_app.get(crop)
            if not faces:
                if track_id not in track_votes:
                    track_votes[track_id] = deque(maxlen=VOTE_BUFFER_SIZE)
                track_votes[track_id].append("Unknown")
                continue
            face = max(faces, key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]))
            emb = getattr(face, "normed_embedding", None)
            if emb is None:
                emb = getattr(face, "embedding", None)
            if emb is None:
                continue
            emb = np.array(emb, dtype=np.float32)
            name, _ = match_embedding_to_gallery(emb, gallery, FACE_MATCH_THRESHOLD)
            if track_id not in track_votes:
                track_votes[track_id] = deque(maxlen=VOTE_BUFFER_SIZE)
            track_votes[track_id].append(name)

        # 4) Behavior detection + filter
        behavior_results = behavior_model.predict(frame, conf=0.01, verbose=False)
        behavior_results = filter_behavior_by_class_conf(
            behavior_results, behavior_model, CONF_BY_CLASS, DEFAULT_CONF
        )
        # 5) Associate each behavior bbox to person track by IoU; one best (behavior, conf) per track
        time_sec = frame_idx / fps
        # Collect per track: (name, behavior, conf, bxyxy) and keep best conf per track
        track_best = {}  # track_id -> (name, behavior, conf, bxyxy)
        if behavior_results[0].boxes is not None and len(behavior_results[0].boxes) > 0:
            names = behavior_model.names
            boxes = behavior_results[0].boxes
            for i in range(len(boxes)):
                bxyxy = boxes.xyxy[i].cpu().numpy()
                cls_idx = int(boxes.cls[i].item())
                conf = float(boxes.conf[i].item())
                if isinstance(names, (list, tuple)):
                    behavior = names[cls_idx] if 0 <= cls_idx < len(names) else f"class_{cls_idx}"
                else:
                    behavior = names.get(cls_idx, f"class_{cls_idx}")
                best_iou = MIN_IOU_BEHAVIOR_PERSON
                best_track_id = None
                for pxyxy, tid in person_boxes:
                    iou = box_iou(bxyxy, pxyxy)
                    if iou > best_iou:
                        best_iou = iou
                        best_track_id = tid
                if best_track_id is None:
                    continue
                name = "Unknown"
                if best_track_id in track_votes and track_votes[best_track_id]:
                    name = Counter(track_votes[best_track_id]).most_common(1)[0][0]
                if best_track_id not in track_best or conf > track_best[best_track_id][2]:
                    track_best[best_track_id] = (name, behavior, conf, bxyxy)

        # 5b) Temporal: update history, smooth, apply minimum duration
        name_behavior_list = []  # (name, behavior, duration_sec, xyxy, confirmed) for drawing
        for track_id, (name, behavior, conf, bxyxy) in track_best.items():
            key = name if name != "Unknown" else f"track_{track_id}"
            if key not in behavior_history:
                behavior_history[key] = []
            behavior_history[key].append((time_sec, behavior))
            # Keep only last SMOOTH_WINDOW_SEC
            cutoff = time_sec - SMOOTH_WINDOW_SEC
            behavior_history[key] = [(t, b) for t, b in behavior_history[key] if t >= cutoff]
            smoothed, duration_sec = smoothed_behavior_and_duration(
                behavior_history[key], time_sec, SMOOTH_WINDOW_SEC
            )
            if smoothed is None:
                continue
            confirmed = duration_sec >= MIN_DURATION_SEC
            name_behavior_list.append((name, smoothed, duration_sec, bxyxy, confirmed))
            if confirmed:
                log_rows.append({
                    "frame": frame_idx,
                    "time_sec": round(time_sec, 2),
                    "student_name": name,
                    "behavior": smoothed,
                    "confidence": round(conf, 3),
                    "duration_sec": round(duration_sec, 1),
                })

        # 6) Draw: person boxes with track_id + name; behavior boxes with "name – behavior"
        vis = frame.copy()
        for xyxy, track_id in person_boxes:
            x1, y1, x2, y2 = map(int, xyxy)
            name = "Unknown"
            if track_id in track_votes and track_votes[track_id]:
                name = Counter(track_votes[track_id]).most_common(1)[0][0]
            label = f"#{track_id} {name}"
            cv2.rectangle(vis, (x1, y1), (x2, y2), (0, 255, 0), 2)
            cv2.putText(vis, label, (x1, y1 - 8), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 1)
        for name, behavior, duration_sec, bxyxy, confirmed in name_behavior_list:
            x1, y1, x2, y2 = map(int, bxyxy)
            label = f"{name} – {behavior} ({duration_sec:.1f}s)"
            color = (255, 165, 0) if confirmed else (180, 180, 180)  # orange when confirmed, gray when building up
            cv2.rectangle(vis, (x1, y1), (x2, y2), color, 2)
            cv2.putText(vis, label, (x1, y1 - 8), cv2.FONT_HERSHEY_SIMPLEX, 0.55, color, 1)

        out.write(vis)
        frame_idx += 1
        if frame_idx % 30 == 0:
            print(f"  Processed {frame_idx}/{max_frames} frames...", flush=True)

    cap.release()
    out.release()

    _report(100)

    # Always write CSV (even if empty) so Flask can detect pipeline finished and ingest if rows exist
    if BEHAVIOR_LOG_CSV:
        with open(BEHAVIOR_LOG_CSV, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(
                f, fieldnames=["frame", "time_sec", "student_name", "behavior", "confidence", "duration_sec"]
            )
            writer.writeheader()
            writer.writerows(log_rows)
        print(f"Behavior log: {BEHAVIOR_LOG_CSV} ({len(log_rows)} rows, only behaviors lasting >={MIN_DURATION_SEC}s)")

    print(f"\nDone! Output video: {OUTPUT_VIDEO}")
    print(f"Processed {frame_idx} frames (~{frame_idx / fps:.1f}s)")
    return log_rows, frame_idx, fps


def _api_patch_status(api_base_url, session_id, secret, status, error_message=None):
    import urllib.request
    import json
    url = f"{api_base_url.rstrip('/')}/api/v1/internal/sessions/{session_id}/status"
    data = json.dumps({"status": status, "error_message": error_message}).encode("utf-8")
    req = urllib.request.Request(url, data=data, method="PATCH", headers={
        "Content-Type": "application/json",
        "X-Internal-Secret": secret,
    })
    try:
        urllib.request.urlopen(req, timeout=10)
    except Exception as e:
        print(f"API notify status failed: {e}", flush=True)


def _api_patch_progress(api_base_url, session_id, secret, progress_0_100):
    """Update session.session_metadata.processing_progress for frontend progress bar."""
    import urllib.request
    import json
    url = f"{api_base_url.rstrip('/')}/api/v1/internal/sessions/{session_id}/status"
    pct = max(0, min(100, int(progress_0_100)))
    data = json.dumps({"processing_progress": pct}).encode("utf-8")
    req = urllib.request.Request(url, data=data, method="PATCH", headers={
        "Content-Type": "application/json",
        "X-Internal-Secret": secret,
    })
    try:
        urllib.request.urlopen(req, timeout=5)
    except Exception:
        pass  # don't spam if API is down


def _api_ingest_behaviors(api_base_url, session_id, secret, csv_path):
    import urllib.request
    import json
    if not Path(csv_path).exists():
        return
    behaviors = []
    with open(csv_path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            try:
                behaviors.append({
                    "frame": int(row.get("frame", 0)),
                    "time_sec": float(row.get("time_sec", 0)),
                    "student_name": (row.get("student_name") or "").strip(),
                    "behavior": (row.get("behavior") or "").strip(),
                    "confidence": float(row.get("confidence", 0)) if row.get("confidence") else None,
                    "duration_sec": float(row.get("duration_sec", 0)) if row.get("duration_sec") else None,
                })
            except (ValueError, KeyError):
                continue
    if not behaviors:
        return
    url = f"{api_base_url.rstrip('/')}/api/v1/internal/sessions/{session_id}/behaviors"
    data = json.dumps({"behaviors": behaviors}).encode("utf-8")
    req = urllib.request.Request(url, data=data, method="POST", headers={
        "Content-Type": "application/json",
        "X-Internal-Secret": secret,
    })
    try:
        urllib.request.urlopen(req, timeout=30)
        print(f"Ingested {len(behaviors)} behavior rows to API.", flush=True)
    except Exception as e:
        print(f"API ingest failed: {e}", flush=True)


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Run behavior pipeline on video; optionally report to API.")
    parser.add_argument("--video", type=str, help="Input video path (overrides default)")
    parser.add_argument("--output-csv", type=str, help="Output behavior CSV path")
    parser.add_argument("--session-id", type=int, help="Session ID for API status/ingest")
    parser.add_argument("--api-base-url", type=str, help="API base URL (e.g. http://127.0.0.1:5000)")
    parser.add_argument("--internal-secret", type=str, default="", help="X-Internal-Secret for API")
    parser.add_argument("--progress-file", type=str, default="", help="Write progress 0-100 to this file (for UI)")
    args = parser.parse_args()

    if args.video:
        VIDEO_PATH = Path(args.video)
    if args.output_csv:
        BEHAVIOR_LOG_CSV = Path(args.output_csv)

    api_base = (args.api_base_url or "").strip()
    session_id = args.session_id
    secret = (args.internal_secret or "").strip()
    progress_file = (args.progress_file or "").strip()
    if session_id and progress_file:
        try:
            Path(progress_file).parent.mkdir(parents=True, exist_ok=True)
            Path(progress_file).write_text("0", encoding="utf-8")
        except Exception:
            pass
    if session_id and api_base and secret:
        _api_patch_status(api_base, session_id, secret, "processing")

    try:
        result = main(api_base_url=api_base, session_id=session_id, internal_secret=secret, progress_file_path=progress_file or None)
        if progress_file:
            try:
                Path(progress_file).write_text("100", encoding="utf-8")
            except Exception:
                pass
        if session_id and api_base and secret:
            if result is not None and BEHAVIOR_LOG_CSV and Path(BEHAVIOR_LOG_CSV).exists():
                _api_ingest_behaviors(api_base, session_id, secret, str(BEHAVIOR_LOG_CSV))
                _api_patch_status(api_base, session_id, secret, "completed")
            elif result is not None:
                _api_patch_status(api_base, session_id, secret, "completed")
            else:
                _api_patch_status(api_base, session_id, secret, "failed", "Pipeline exited early")
    except Exception as e:
        if progress_file:
            try:
                Path(progress_file).write_text("100", encoding="utf-8")
            except Exception:
                pass
        if session_id and api_base and secret:
            _api_patch_status(api_base, session_id, secret, "failed", str(e))
        raise
