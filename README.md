# FacultyWare — Sistem Informasi Manajemen Proyek FTI

> Aplikasi web untuk manajemen proyek, kepanitiaan, anggaran, dan laporan kegiatan Fakultas Teknologi Informasi.

---

## Daftar Isi

- [Tentang Proyek](#tentang-proyek)
- [Fitur Utama](#fitur-utama)
- [Tech Stack](#tech-stack)
- [Prasyarat](#prasyarat)
- [Instalasi & Setup](#instalasi--setup)
- [Konfigurasi Environment](#konfigurasi-environment)
- [Menjalankan Aplikasi](#menjalankan-aplikasi)
- [REST API](#rest-api)
- [Struktur Proyek](#struktur-proyek)
- [Akun Default](#akun-default)
- [Kontributor](#kontributor)

---

## Tentang Proyek

FacultyWare adalah sistem informasi berbasis web yang dirancang untuk membantu pengelolaan kegiatan di lingkungan Fakultas Teknologi Informasi Universitas Andalas. Sistem ini mencakup manajemen proyek, kepanitiaan, anggaran (RAB), pengeluaran, dan pembuatan laporan secara digital.

---

## Fitur Utama

### Manajemen Proyek
- Buat, lihat, ubah, dan hapus proyek
- Filter berdasarkan status (Draft, Aktif, Selesai, Dibatalkan)
- Pencarian dan paginasi
- REST API untuk integrasi eksternal

### Manajemen Kepanitiaan
- Buat dan kelola kepanitiaan per proyek
- Tambah dan hapus anggota panitia
- Generate Surat Keputusan (SK) Kepanitiaan otomatis dalam format `.docx`

### Manajemen RAB (Rencana Anggaran Biaya)
- Buat RAB dengan rincian item anggaran
- Pantau penggunaan anggaran secara real-time
- Export laporan RAB ke format Excel (`.xlsx`)

### Manajemen Pengeluaran
- Catat pengeluaran per item anggaran
- Upload bukti pengeluaran (struk/nota) dalam format JPG, PNG, atau PDF
- Validasi otomatis agar pengeluaran tidak melebihi sisa anggaran

### Manajemen Tugas
- Buat dan pantau tugas per kepanitiaan
- Catat progress tugas dengan lampiran

### Laporan
- Ringkasan dashboard dengan statistik kegiatan
- Laporan rekapitulasi anggaran

---

## Tech Stack

| Kategori       | Teknologi                                    |
|----------------|----------------------------------------------|
| Runtime        | Node.js                                      |
| Framework      | Express.js                                   |
| Template Engine| EJS                                          |
| Database       | MySQL                                        |
| Session Store  | express-mysql-session                        |
| Styling        | Tailwind CSS (via Basecoat)                  |
| Interaktivitas | HTMX                                         |
| Auth           | bcryptjs + express-session                   |
| Export         | ExcelJS (`.xlsx`), Docx (`.docx`), PDFKit    |
| Testing        | Playwright (E2E)                             |

---

## Prasyarat

Pastikan software berikut sudah terinstall di komputermu:

- **Node.js** v18 atau lebih baru → [nodejs.org](https://nodejs.org)
- **MySQL** v8 atau lebih baru (bisa melalui XAMPP/Laragon)
- **npm** (sudah terinstall bersama Node.js)

---

## Instalasi & Setup

**1. Clone repositori ini**
```bash
git clone <url-repositori>
cd facultyware-A14-FTIProject
```

**2. Install semua dependensi**
```bash
npm install
```

**3. Buat file konfigurasi environment**

Salin file `.env.example` (atau buat manual) dan sesuaikan isinya:
```bash
cp .env.example .env
```

**4. Buat database MySQL**

Buat database baru bernama `facultyware` di phpMyAdmin atau MySQL CLI:
```sql
CREATE DATABASE facultyware CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

**5. Import skema database**

Jalankan skrip inisialisasi yang akan membuat semua tabel dan data awal (akun admin, role, permission):
```bash
node scripts/init_db.js
```

---

## Konfigurasi Environment

Buat file `.env` di root proyek dengan isi berikut:

```env
# Database
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=
DB_NAME=facultyware

# Server
PORT=3000

# Session
SESSION_SECRET=ganti-dengan-string-acak-yang-kuat
```

---

## Menjalankan Aplikasi

**Mode Development** (dengan auto-restart saat file berubah):
```bash
npm run dev
```

**Mode Production:**
```bash
npm start
```

Aplikasi akan berjalan di: **http://localhost:3000**

---

## REST API

Aplikasi ini mengekspos REST API untuk fitur Manajemen Proyek. Semua endpoint membutuhkan autentikasi (cookie sesi aktif).

### Autentikasi via Postman

Sebelum mengakses endpoint API, lakukan login terlebih dahulu:

```
POST http://localhost:3000/login
Content-Type: application/x-www-form-urlencoded

email=admin@example.com&password=password
```

### Endpoint Tersedia

| Method | Endpoint              | Deskripsi                      |
|--------|-----------------------|--------------------------------|
| `GET`  | `/api/projects`       | Ambil semua data proyek        |
| `GET`  | `/api/projects/:id`   | Ambil detail proyek by ID      |
| `POST` | `/api/projects`       | Buat proyek baru               |

### Contoh Request — GET /api/projects

```http
GET http://localhost:3000/api/projects
```

Query Parameters opsional:
| Parameter | Tipe   | Contoh      | Deskripsi                        |
|-----------|--------|-------------|----------------------------------|
| `search`  | string | `seminar`   | Cari berdasarkan nama/deskripsi  |
| `status`  | string | `active`    | Filter: draft/active/completed/cancelled |
| `page`    | number | `2`         | Nomor halaman (default: 1)       |
| `limit`   | number | `5`         | Jumlah data per halaman (default: 10)|

### Contoh Response — GET /api/projects

```json
{
  "success": true,
  "message": "Data retrieved successfully",
  "data": [
    {
      "id": 1,
      "name": "Seminar Teknologi AI",
      "description": "Seminar tahunan FTI",
      "objective": "Meningkatkan wawasan mahasiswa",
      "start_date": "2026-07-01",
      "end_date": "2026-07-01",
      "status": "active",
      "created_at": "2026-06-01T10:00:00.000Z"
    }
  ],
  "pagination": {
    "total": 1,
    "page": 1,
    "limit": 10,
    "totalPages": 1
  }
}
```

### Contoh Request — POST /api/projects

```http
POST http://localhost:3000/api/projects
Content-Type: application/x-www-form-urlencoded

name=Seminar AI&objective=Meningkatkan wawasan&start_date=2026-08-01&status=draft
```

Body yang diperlukan:
| Field              | Wajib | Tipe   | Deskripsi                                      |
|--------------------|-------|--------|------------------------------------------------|
| `name`             | ✅    | string | Nama proyek (maks. 255 karakter)               |
| `objective`        | ✅    | string | Tujuan proyek                                  |
| `start_date`       | ✅    | date   | Tanggal mulai (format: YYYY-MM-DD)             |
| `status`           | ✅    | enum   | draft / active / completed / cancelled         |
| `description`      | ❌    | string | Deskripsi proyek                               |
| `expected_outcome` | ❌    | string | Target capaian proyek                          |
| `end_date`         | ❌    | date   | Tanggal selesai (format: YYYY-MM-DD)           |

---

## Struktur Proyek

```
facultyware-A14-FTIProject/
├── app.js                  # Entry point & konfigurasi middleware
├── bin/
│   └── www                 # HTTP server launcher
├── controllers/            # Logika bisnis per fitur
│   ├── projectController.js
│   ├── committeeController.js
│   ├── budgetController.js
│   ├── taskController.js
│   └── ...
├── middlewares/
│   ├── auth.js             # Middleware autentikasi
│   ├── acl.js              # Access Control (RBAC)
│   └── error.js            # Error handler
├── routes/                 # Definisi rute Express
├── views/                  # Template EJS
│   ├── partials/           # Komponen reusable (sidebar, head, dll)
│   ├── projects/
│   ├── committees/
│   ├── budgets/
│   └── ...
├── public/
│   └── assets/
│       ├── styles.css      # Stylesheet utama (Tailwind/Basecoat)
│       └── js/             # Komponen JavaScript vanilla
├── lib/
│   └── db.js               # Koneksi & query database
├── scripts/
│   └── init_db.js          # Skrip inisialisasi database
└── tests/                  # E2E test dengan Playwright
```

---

## Akun Default

Setelah menjalankan `node scripts/init_db.js`, akun berikut tersedia:

| Field    | Value                |
|----------|----------------------|
| Email    | `admin@example.com`  |
| Password | `password`           |
| Role     | Admin (semua akses)  |

> ⚠️ **Penting:** Ganti password ini setelah pertama kali login di lingkungan production!

---

## Kontributor

**Kelompok A14 — Fakultas Teknologi Informasi, Universitas Andalas**

Nayla Puspita Sari (2411521007)
Anggun Meika Candra (2411521012)

