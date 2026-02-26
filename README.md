# Classroom Behavior Analytics System

A comprehensive web-based system for analyzing student behavior in classroom videos using computer vision and AI.

## Overview

This system automatically processes classroom video recordings to:
- **Identify students** using face recognition (InsightFace)
- **Track individuals** across video frames (YOLO + ByteTrack)
- **Detect behaviors** such as sleeping, hand raising, mobile phone use, reading, writing, and attention patterns
- **Generate analytics** and visualizations through an interactive dashboard

## Key Features

- 🎥 **Video Processing Pipeline**: Automated video analysis with person tracking and behavior detection
- 👤 **Student Recognition**: Face recognition system that identifies students from a pre-built gallery
- 📊 **Analytics Dashboard**: Web interface for viewing behavior statistics, trends, and reports
- 📈 **Session Management**: Organize and track multiple classroom sessions
- 📤 **Data Export**: Export behavior logs and analytics in various formats

## Technology Stack

- **Backend**: Flask (Python) with SQLite database
- **Frontend**: Next.js (React/TypeScript) with Tailwind CSS
- **Computer Vision**: 
  - YOLO (Ultralytics) for person detection and behavior classification
  - InsightFace for face recognition
  - ByteTrack for multi-object tracking
- **AI Models**: Custom YOLO models for behavior detection

## Quick Start

See [HOW_TO_RUN.md](HOW_TO_RUN.md) for detailed setup and running instructions.

## Project Structure

```
├── backend/          # Flask API and video processing pipeline
├── frontend/         # Next.js web application
└── HOW_TO_RUN.md     # Detailed setup guide
```

---

For detailed installation and usage instructions, please refer to [HOW_TO_RUN.md](HOW_TO_RUN.md).
