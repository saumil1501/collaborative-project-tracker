# Collaborative Project Tracker

A full-stack, multi-user project management application built using **Spring Boot, React, TypeScript, and MySQL**. It enables teams to organize projects, manage members, assign issues, and track progress through a Kanban-style workflow.

## Features

### Authentication and Security
- User registration and login
- Session-based authentication using Spring Security
- BCrypt password hashing
- CSRF protection for state-changing requests
- Protected REST API endpoints
- Project-level role-based authorization

### Project Management
- Create, view, and delete projects
- Manage multiple project workspaces
- Access owned and shared projects
- Restrict project deletion to owners

### Team Collaboration
- Add registered users to projects using their email addresses
- Project-level `OWNER` and `MEMBER` roles
- Shared project visibility across team members
- Authorization checks to prevent unauthorized access

### Issue Management
- Create, view, edit, and delete issues
- Assign issues to project members
- Set issue priorities: `LOW`, `MEDIUM`, `HIGH`
- Set due dates and descriptions
- Update issue statuses: `TODO`, `IN_PROGRESS`, `DONE`
- Validate that assignees belong to the project

### Kanban Board
- Three-column board: To Do, In Progress, Done
- View issues grouped by status
- Update issue status directly from the board
- Manage assignments, priorities, and due dates
- Persist changes in MySQL
- Drag cards between columns with automatic rollback if saving fails
- Search issue titles and filter by assignee, priority, or "Assigned to me"
- Open issue details in an accessible side panel to create, edit, or delete issues
- View total, completed, and overdue counts, with overdue badges on unfinished issues
- Responsive dark layout with loading placeholders, empty states, and save feedback

## Tech Stack

| Layer | Technologies |
|---|---|
| Frontend | React, TypeScript, Vite |
| Styling | Tailwind CSS, Lucide React |
| Backend | Java 21, Spring Boot 4 |
| Security | Spring Security, BCrypt, HTTP Sessions, CSRF |
| Persistence | Spring Data JPA, Hibernate |
| Database | MySQL 8 |
| API Communication | Axios |
| Build Tools | Maven, npm |
| Version Control | Git, GitHub |

## Architecture

The application follows a layered architecture separating the user interface, HTTP controllers, business logic, persistence, and database.

```text
React + TypeScript
        |
        | Axios / REST API
        v
Spring Boot Controllers
        |
        v
Service Layer
  |-- Business Logic
  |-- Project Authorization
  |-- Membership Validation
        |
        v
Spring Data JPA Repositories
        |
        v
Hibernate ORM
        |
        v
MySQL Database
```

Spring Security handles authentication and session management. Authorization is enforced in the service layer using the authenticated user's identity.

## Database Design

The application uses five core domain entities:

| Entity | Description |
|---|---|
| AppUser | Stores registered users and encrypted password hashes |
| Project | Stores project information and ownership |
| ProjectMembership | Maps users to projects with OWNER/MEMBER roles |
| Issue | Stores tasks, status, priority, assignee, and due date |

### Entity Relationships

```text
AppUser
   |
   +----< Project (owner)
   |
   +----< ProjectMembership >---- Project
   |                                  |
   |                                  +----< Issue
   |
   +----< Issue (assignee)
```

A user can participate in multiple projects, and a project can have multiple members. Each issue belongs to one project and may optionally be assigned to a project member.

## REST API Endpoints

### Authentication

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/auth/csrf` | Retrieve CSRF token |
| POST | `/api/auth/register` | Register user |
| POST | `/api/auth/login` | Authenticate user |
| GET | `/api/auth/me` | Retrieve current user |
| POST | `/api/auth/logout` | End session |

### Projects

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/projects` | Create project |
| GET | `/api/projects` | List accessible projects |
| DELETE | `/api/projects/{id}` | Delete owned project |

### Memberships

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/projects/{projectId}/members` | Add member |
| GET | `/api/projects/{projectId}/members` | List project members |

### Issues

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/projects/{projectId}/issues` | Create issue |
| GET | `/api/projects/{projectId}/issues` | List project issues |
| PUT | `/api/projects/{projectId}/issues/{issueId}` | Update issue |
| PATCH | `/api/projects/{projectId}/issues/{issueId}/status` | Change status |
| DELETE | `/api/projects/{projectId}/issues/{issueId}` | Delete issue |

## Getting Started

### Prerequisites

- Java 21
- Maven (or included Maven Wrapper)
- Node.js and npm
- MySQL 8
- Git

### 1. Clone the Repository

```bash
git clone https://github.com/saumil1501/collaborative-project-tracker.git
cd collaborative-project-tracker
```

Replace `YOUR_USERNAME` with your GitHub username.

### 2. Configure MySQL

Create the database:

```sql
CREATE DATABASE collaborative_tracker;
```

Configure the backend using environment variables:

```properties
spring.datasource.url=jdbc:mysql://localhost:3306/collaborative_tracker
spring.datasource.username=${DB_USERNAME:root}
spring.datasource.password=${DB_PASSWORD}
```

Set `DB_PASSWORD` to your local MySQL password.

For local development, Hibernate is configured with:

```properties
spring.jpa.hibernate.ddl-auto=update
```

Database schema management can be migrated to Flyway for production environments.

### 3. Start the Backend

From the `backend` directory:

**Windows:**

```powershell
.\mvnw.cmd spring-boot:run
```

**macOS/Linux:**

```bash
./mvnw spring-boot:run
```

Backend: `http://localhost:8080`

Health endpoint: `http://localhost:8080/api/health`

### 4. Start the Frontend

From the `frontend` directory:

```bash
npm install
npm run dev
```

Frontend: `http://localhost:5173`

Vite proxies `/api` requests to the Spring Boot backend.

## Example Workflow

1. User A registers and creates a project.
2. User A adds User B as a project member.
3. User B logs in and accesses the shared project.
4. User A creates an issue and assigns it to User B.
5. User B moves the issue from To Do to In Progress and then Done.
6. Both users can view the updated project board.

## Security Design

- Passwords are stored as BCrypt hashes rather than plaintext.
- Authentication uses server-side HTTP sessions.
- CSRF tokens protect state-changing requests.
- Project membership is checked before accessing project issues.
- Only project owners can add members and delete projects.
- Users cannot assign issues to individuals outside the project.
- Unauthorized project access is rejected by the backend.

## Frontend Verification

From `frontend`, run `npm test`, `npm run lint`, and `npm run build`.
The logic tests use Node.js 22.6 or newer for TypeScript type stripping.

An optional browser check in `frontend/tests/board.browser.mjs` uses Playwright and an installed Chrome browser. Start the Vite dev server, make Playwright available locally or via `NODE_PATH`, then run `node tests/board.browser.mjs` from `frontend`. Set `BOARD_TEST_BROWSER=msedge` to use Edge, or `BOARD_TEST_URL` to override the default `http://127.0.0.1:5173`. This check uses mock API responses and covers filtering, card moves, failed-move rollback, failed-save recovery, issue creation/editing/deletion, mobile overflow, panel dismissal, and load retry. It does not verify the backend or MySQL persistence.

## Future Enhancements

- Issue comments and activity history
- Server-side advanced search, filtering, and pagination
- Optimistic locking for concurrent issue updates
- Flyway database migrations
- Backend integration tests and CI/CD
- Docker Compose configuration
- Deployment to a cloud platform

## Project Structure

```text
collaborative-project-tracker/
├── backend/
│   ├── src/
│   │   ├── main/
│   │   │   ├── java/
│   │   │   │   └── com/example/collaborative_project_tracker/
│   │   │   │       ├── controller/
│   │   │   │       ├── dto/
│   │   │   │       ├── model/
│   │   │   │       ├── repository/
│   │   │   │       ├── security/
│   │   │   │       └── service/
│   │   │   └── resources/
│   │   │       └── application.properties
│   │   └── test/
│   ├── pom.xml
│   └── mvnw
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── KanbanBoard.tsx
│   │   │   ├── ProjectDashboard.tsx
│   │   │   └── ProjectMembers.tsx
│   │   ├── services/
│   │   │   └── api.ts
│   │   └── App.tsx
│   ├── package.json
│   └── vite.config.ts
├── .gitignore
└── README.md
```

## Author

Developed as a full-stack software engineering project to explore REST API development, relational database design, session-based authentication, authorization, and collaborative task management.
