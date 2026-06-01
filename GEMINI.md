# Project: central-panel (facultyware)

## Overview
This is a modern Node.js web application built with Express and EJS. It focuses on a clean, "shadcn/ui" aesthetic using vanilla JavaScript and Tailwind CSS via the **Basecoat** library, with **HTMX** for dynamic interactivity.

## Tech Stack
- **Framework:** Express.js
- **Template Engine:** EJS
- **Styling:** Tailwind CSS (via Basecoat)
- **UI Components:** Basecoat (Vanilla JS + CSS)
- **Interactivity:** HTMX (for partial updates and SPA-like navigation)

## Project Structure & Conventions
- `app.js`: Application entry point and middleware configuration.
- `routes/`: Express router definitions.
- `controllers/`: Application logic for handling requests, extracted from routes.
- `middlewares/`: Custom middleware for authentication, error handling, and access control.
- `lib/db.js`: Database connection and query utility.
- `views/`: EJS templates. 
    - Use `home.ejs` as the primary reference for layout and component usage.
    - Leverage HTMX attributes (`hx-boost`, `hx-target`, `hx-select`) for seamless transitions.
- `public/assets/`:
    - `styles.css`: The primary Tailwind/Basecoat stylesheet.
    - `js/`: Modular vanilla JS components for UI elements. Ensure any new interactive components follow this pattern.

## Development Guidelines
- **UI Components:** Do NOT use React. All UI components are vanilla JS/CSS. Refer to the `public/assets/js/` directory for existing implementations.
- **Styling:** Prefer standard Tailwind classes. Basecoat provides a set of pre-defined components (`btn`, `card`, `input`, etc.) that should be used consistently.
- **Dynamic Content:** Use HTMX for any dynamic updates. Favor server-side partial rendering over client-side fetching and JSON parsing where possible.
- **Themes:** Support for light/dark mode and variant themes is handled by `localStorage` and class toggling on the `<html>` element. Ensure new views include the initialization scripts found in `home.ejs` or `login.ejs`.

## Access Control (ACL)
The project uses a Role-Based Access Control (RBAC) system managed via the `middlewares/acl.js` middleware.

### Database Schema
The following tables are required for ACL:
- **`roles`**: Defines user roles.
    - `id` (INT, Primary Key)
    - `name` (VARCHAR, Unique) - e.g., 'admin', 'staff', 'student'
- **`permissions`**: Defines granular actions.
    - `id` (INT, Primary Key)
    - `name` (VARCHAR, Unique) - e.g., 'manage_users', 'view_reports'
- **`role_has_permissions`**: Pivot table linking roles to permissions.
    - `role_id` (INT, Foreign Key -> `roles.id`)
    - `permission_id` (INT, Foreign Key -> `permissions.id`)
- **`user_has_roles`**: Pivot table linking users to roles.
    - `user_id` (INT, Foreign Key -> `users.id`)
    - `role_id` (INT, Foreign Key -> `roles.id`)

### Usage
To protect a route with a specific permission (or any one of multiple permissions):
```javascript
const { checkPermission } = require('../middlewares/acl');

// Single permission
router.get('/admin/users', checkPermission('manage_users'), userController.list);

// Multiple permissions (user must have at least one)
router.get('/reports', checkPermission(['view_reports', 'manage_all']), reportController.index);
```

## Commands
- `npm start`: Runs the production server using `bin/www`.
- `npm run dev`: Runs the server with `nodemon` for development.

---

# Additional Development Rules

## Database Usage

Before implementing any feature:

1. Analyze the existing database schema.
2. Use existing tables whenever possible.
3. Do not create new tables unless absolutely necessary.
4. Explain table relationships before generating code.
5. Wait for confirmation before moving to implementation.

Always prioritize the existing Facultyware database structure.

---

## Validation Requirements

All create and update operations must perform server-side validation.

Required validation includes:

- Required fields
- Data type validation
- Length validation
- Enum validation
- Foreign key validation
- File upload validation

Client-side validation may be added for better user experience, but server-side validation is mandatory.

---

## Security Requirements

### Database Queries

Always use parameterized queries.

Example:

```javascript
db.query(
  "SELECT * FROM events WHERE id = ?",
  [id]
);
```

Never build SQL queries using string concatenation.

### File Uploads

Validate:

- File type
- File extension
- File size

Reject unsupported files.

---

## Export Requirements

When implementing export features:

Required flow:

User clicks Export
→ Server generates file
→ File is downloaded automatically

Do not require manual retrieval from server storage.

---

## REST API Requirements

At least one feature must expose REST API endpoints.

Allowed methods:

- GET
- POST

API responses must use JSON format.

Example:

```json
{
  "success": true,
  "message": "Data retrieved successfully",
  "data": []
}
```

---

# FTI Project Module

## Development Workflow

Features must be implemented sequentially.

Complete one module before moving to the next.

### Phase 1 - Project Management

Primary Table:

- events

Responsibilities:

- Create Project
- View Project List
- View Project Details
- Update Project
- Delete Project
- Search
- Pagination
- REST API (GET & POST)

Suggested API Endpoints:

```http
GET /api/projects
GET /api/projects/:id
POST /api/projects
```

Phase 1 must be completed and verified before continuing.

---

### Phase 2 - Committee Management

Primary Tables:

- committees
- committee_members

Responsibilities:

- Create Committee
- View Committee List
- View Committee Details
- Update Committee
- Delete Committee
- Manage Committee Members
- Search
- Pagination

Additional Requirement:

Generate Committee Appointment Letter (.DOCX)

Suggested Library:

```bash
npm install docx
```

Required Flow:

User clicks Generate SK
→ Server generates DOCX
→ File downloads automatically

Phase 2 begins only after Project Management is completed.

---

## Code Quality

Generated code should be:

- Clean
- Readable
- Consistent with existing Facultyware structure
- Easy to maintain
- Easy to debug

Guidelines:

- Use descriptive variable names
- Keep functions focused on a single responsibility
- Avoid duplicated code
- Provide meaningful error messages
- Follow existing project conventions before introducing new patterns

---

## AI Assistant Behavior

When assisting development:

1. Analyze the database before generating code.
2. Explain the implementation plan first.
3. Generate code incrementally.
4. Follow the existing Facultyware architecture.
5. Prefer modifying existing files over creating unnecessary files.
6. Do not skip validation and ACL considerations.
7. Wait for confirmation before moving to the next development phase.