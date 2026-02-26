"""
Phase 1: Build registered-students gallery from Images/<StudentName>/*.jpg.
Uses InsightFace for face detection + embedding. Saves gallery to disk for run_pipeline.py.
"""
from pathlib import Path
import pickle
import numpy as np

# Paths (edit as needed)
BASE_DIR = Path(__file__).resolve().parent
IMAGES_DIR = BASE_DIR / "Images"
GALLERY_PATH = BASE_DIR / "students_gallery.pkl"
SUPPORTED_EXT = (".jpg", ".jpeg", ".png", ".bmp")


def build_gallery(images_dir: Path, gallery_path: Path, face_model_name: str = "buffalo_l"):
    """Scan images_dir subfolders (folder name = student name), extract face embeddings, save gallery."""
    try:
        from insightface.app import FaceAnalysis
        import cv2
    except ImportError as e:
        print("Error: Install dependencies: pip install insightface onnxruntime opencv-python")
        raise SystemExit(1) from e

    images_dir = Path(images_dir)
    gallery_path = Path(gallery_path)

    print(f"Loading InsightFace model: {face_model_name} (first run may download)...")
    app = FaceAnalysis(name=face_model_name, providers=["CPUExecutionProvider"])
    app.prepare(ctx_id=0, det_size=(640, 640))

    # gallery: student_name -> list of embeddings (Option A: all embeddings per student)
    gallery = {}
    total_images = 0
    total_faces = 0

    for subdir in sorted(images_dir.iterdir()):
        if not subdir.is_dir():
            continue
        student_name = subdir.name
        image_paths = [
            p for p in subdir.iterdir()
            if p.suffix.lower() in SUPPORTED_EXT
        ]
        if not image_paths:
            print(f"  Skip {student_name}: no images")
            continue

        embeddings_list = []
        for path in image_paths:
            img = cv2.imread(str(path))
            if img is None:
                continue
            total_images += 1
            faces = app.get(img)
            if not faces:
                continue
            # Use largest face by bbox area
            face = max(faces, key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]))
            emb = face.normed_embedding
            if emb is not None:
                embeddings_list.append(np.array(emb, dtype=np.float32))
                total_faces += 1

        if embeddings_list:
            gallery[student_name] = embeddings_list
            print(f"  {student_name}: {len(embeddings_list)} face embeddings from {len(image_paths)} images")
        else:
            print(f"  Skip {student_name}: no faces detected")

    if not gallery:
        print("Error: No embeddings extracted. Check Images/ folder structure and image quality.")
        return

    # Save: dict of name -> list of embeddings (numpy arrays)
    with open(gallery_path, "wb") as f:
        pickle.dump(gallery, f)
    print(f"\nGallery saved to {gallery_path}")
    print(f"Total: {len(gallery)} students, {total_faces} embeddings from {total_images} images")
    return gallery


if __name__ == "__main__":
    build_gallery(IMAGES_DIR, GALLERY_PATH)
