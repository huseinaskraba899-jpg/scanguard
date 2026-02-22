# ScanGuard AI — Echtzeit-Sicherheitsplattform für den Einzelhandel

![ScanGuard Logo](https://img.shields.io/badge/ScanGuard-AI-%23007ACC?style=for-the-badge&logo=shippable&logoColor=white)
![Docker](https://img.shields.io/badge/docker-%232496ED.svg?style=for-the-badge&logo=docker&logoColor=white)
![NodeJS](https://img.shields.io/badge/node.js-6DA55F?style=for-the-badge&logo=node.js&logoColor=white)
![Python](https://img.shields.io/badge/python-3670A0?style=for-the-badge&logo=python&logoColor=ffdd54)
![License](https://img.shields.io/badge/license-MIT-green?style=for-the-badge)

ScanGuard ist eine hochmoderne Sicherheitsplattform, die künstliche Intelligenz und Computer Vision nutzt, um Verluste an SB-Kassen (Self-Checkout) in Echtzeit zu verhindern. Die Engine erkennt automatisch, wenn Artikel am Scanner vorbeigeführt werden, ohne registriert zu werden, und benachrichtigt das Personal unmittelbar.

## 🚀 Kern-Features

- **Echtzeit-Objekterkennung**: YOLOv8-basierte Analyse von RTSP-Kamerastreams.
- **Multi-Object Tracking**: Präzise Verfolgung von Kunden und Artikeln (ByteTrack-inspirierte Logic).
- **Zonen-Management**: Definition von Scan- und Exit-Zonen zur präzisen Anomalie-Erkennung.
- **Echtzeit-Alerts**: Sofortige Benachrichtigung via WebSockets (Socket.IO).
- **Multi-Tenant Architektur**: Vorbereitet für SaaS-Betrieb mit Mandantentrennung.
- **Statistik-Dashboard**: Tägliche KPIs zu Detektionen, Alerts und Bestätigungsraten.

## 🏗️ Architektur

```mermaid
graph TD
    A[RTSP Kamera] -->|H.264 Stream| B[CV-Engine Python]
    B -->|YOLOv8 Detektion| C[Tracking & Logic]
    C -->|Detektions-Events| D[Backend Node.js]
    C -->|Non-Scan Alerts| D
    D -->|Persistence| E[(PostgreSQL)]
    D -->|Real-time Events| F[Dashboard / Frontend]
    F -->|Management| D
```

## 🛠️ Quick Start

### Voraussetzungen
- Docker & Docker Compose
- Rechner mit CPU (GPU optional für bessere Performance)

### Setup
1. Repository klonen:
   ```bash
   git clone https://github.com/huseinaskraba899-jpg/scanguard.git
   cd scanguard
   ```

2. `.env` Datei erstellen:
   ```bash
   cp .env.example .env
   # API Keys und Secrets anpassen
   ```

3. Plattform starten:
   ```bash
   docker compose up --build
   ```

Das Backend ist nun unter `http://localhost:3000` und die CV-Engine unter `http://localhost:8000` erreichbar.

## 🔌 API Dokumentation (Auszug)

### Backend (Node.js)

| Methode | Endpunkt | Beschreibung | Auth |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/cv/detections` | Empfängt Rohdaten von CV-Engine | API-Key |
| `POST` | `/api/cv/alerts` | Empfängt Non-Scan Warnungen | API-Key |
| `GET` | `/api/cv/alerts`| Liste aller Warnungen abrufen | JWT |
| `PATCH` | `/api/cv/alerts/:id` | Status einer Warnung aktualisieren | JWT |

### CV-Engine (Python)

| Methode | Endpunkt | Beschreibung |
| :--- | :--- | :--- |
| `GET` | `/health` | Status-Check der Engine & Modelle |
| `GET` | `/cameras` | Liste der aktiven Kamera-Streams |
| `POST` | `/cameras` | Neuen RTSP-Stream hinzufügen |
| `DELETE` | `/cameras/:id` | Kamera-Stream entfernen |

## ⚙️ Umgebungsvariablen

| Variable | Beschreibung | Standard |
| :--- | :--- | :--- |
| `DATABASE_URL` | PostgreSQL Verbindungs-URL | `postgresql://scanguard:scanguard@postgres:5432/scanguard` |
| `SCANGUARD_API_KEY` | Key für Engine-Backend Kommunikation | `changeme` |
| `CV_MODEL_PATH` | Pfad zum YOLO Model (.pt) | `/models/yolov8n.pt` |
| `CV_CONFIDENCE_THRESHOLD` | Empfindlichkeit der Erkennung | `0.45` |

## 🗺️ Roadmap

- [ ] Web-basiertes Dashboard für Live-Monitoring
- [ ] WebSocket-Live-Stream Relay (Low Latency)
- [ ] Integration mit Kassensystemen (POS API)
- [ ] Multi-GPU Unterstützung für >20 Kameras pro Node
- [ ] Cloud-Deployment Templates (Terraform / K8s)

## 📄 Lizenz
Dieses Projekt ist unter der MIT-Lizenz lizenziert - siehe [LICENSE](LICENSE) für Details.
