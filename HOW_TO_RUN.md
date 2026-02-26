# How to Run the Classroom Analytics Website

This package contains the **frontend** (web UI) and **backend** (Flask API + optional video pipeline). Follow the steps below to run everything on your machine.

---

## Prerequisites

- **Python 3.10+** (for backend)
- **Node.js 18+** and **npm** (for frontend)
- (Optional) **CUDA-capable GPU** for faster video processing

---

## 1. Backend (Flask API)

The backend serves the API at `http://127.0.0.1:5000`. The frontend talks to this URL.

### 1.1 Create a virtual environment (recommended)

```bash
cd backend
python -m venv venv
```

- **Windows:** `venv\Scripts\activate`
- **macOS/Linux:** `source venv/bin/activate`

### 1.2 Install dependencies

```bash
pip install -r requirements_flask.txt
```

### 1.3 Run the API server

```bash
python app.py
```

You should see:

- `Classroom Behavior API: login route registered: ...`
- Server running at `http://0.0.0.0:5000`

**Default admin login:** `admin@example.com` / `admin123` (change in production.)

Leave this terminal open. The API will create a SQLite database (`classroom_api.db`) in the `backend` folder on first run.

---

## 2. Frontend (Next.js)

The frontend runs at `http://localhost:3000` and uses the backend at `http://127.0.0.1:5000`.

### 2.1 Install dependencies

```bash
cd frontend
npm install
```

### 2.2 (Optional) Configure API URL

If your backend is not at `http://127.0.0.1:5000`, create a file `.env.local` in the `frontend` folder:

```
NEXT_PUBLIC_API_URL=http://127.0.0.1:5000
NEXT_PUBLIC_WS_URL=ws://127.0.0.1:5000
```

### 2.3 Run the frontend

**Development:**

```bash
npm run dev
```

Open **http://localhost:3000** in your browser.

**Production build:**

```bash
npm run build
npm start
```

Then open **http://localhost:3000**.

---

## 3. Summary – Quick Start

1. **Terminal 1 – Backend**
   ```bash
   cd backend
   python -m venv venv
   venv\Scripts\activate    # Windows
   pip install -r requirements_flask.txt
   python app.py
   ```

2. **Terminal 2 – Frontend**
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

3. Open **http://localhost:3000** and log in with `admin@example.com` / `admin123`.

---

## 4. Optional: Video Processing Pipeline

To process videos (student identification + behavior detection), you need the pipeline dependencies and optional assets.

### 4.1 Install pipeline dependencies

From the `backend` folder:

```bash
pip install -r requirements_pipeline.txt
```

This installs PyTorch, Ultralytics (YOLO), InsightFace, OpenCV, etc. On Windows, if PyTorch fails, install it from [pytorch.org](https://pytorch.org) first.

### 4.2 Build student gallery (one-time)

Place student face images in folders under a folder (e.g. `Images/StudentName/*.jpg`). Then run:

```bash
python build_gallery.py
```

This creates `students_gallery.pkl` used for face recognition.

### 4.3 Run pipeline on a video

1. Put your video in the `backend` folder (e.g. `Video.mp4`) or set the path in `run_pipeline.py`.
2. Run:

   ```bash
   python run_pipeline.py
   ```

   Or to report progress to the API (when a session is created via the website):

   ```bash
   python run_pipeline.py --api-base-url http://127.0.0.1:5000 --session-id <ID> --internal-secret <SECRET>
   ```

Output: `output_identified.mp4` and `behavior_log.csv` in the `backend` folder.

---

## 5. Troubleshooting

- **Frontend shows “Network Error” or “CORS”**  
  Ensure the backend is running at `http://127.0.0.1:5000` and that you did not change the port in `app.py`.

- **Port 5000 or 3000 already in use**  
  Stop the other program using that port, or change the port in `app.py` (backend) or `npm run dev` (frontend: `npm run dev -- -p 3001`).

- **Login returns 404**  
  Make sure you started the backend (`python app.py`) and that no other app is serving on port 5000.

- **Pipeline fails (e.g. “No module named 'insightface'”)**  
  Install pipeline deps: `pip install -r requirements_pipeline.txt` from the `backend` folder.

---

## Folder structure in this zip

```
├── HOW_TO_RUN.md          (this file)
├── backend/               (Flask API + pipeline scripts)
│   ├── app.py
│   ├── api/
│   ├── models.py
│   ├── auth_utils.py
│   ├── requirements_flask.txt
│   ├── requirements_pipeline.txt
│   ├── run_pipeline.py
│   ├── build_gallery.py
│   └── ...
└── frontend/              (Next.js app)
    ├── package.json
    ├── app/
    ├── components/
    └── ...
```

Run the **backend** from the `backend` folder and the **frontend** from the `frontend` folder as described above.
