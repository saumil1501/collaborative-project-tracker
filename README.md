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
- Owners can edit project names and descriptions from the board's Project settings panel

### Team Collaboration
- Add registered users to projects using their email addresses
- Project-level `OWNER` and `MEMBER` roles
- Shared project visibility across team members
- Authorization checks to prevent unauthorized access
- Owners can remove members; their issues become unassigned while comments and activity remain
- Members must request permission to leave; owners approve or reject requests
- Members can cancel their pending request and retain access while requests are pending or rejected
- Owners cannot leave their own project or remove themselves
- Each member has one latest leave-request record per project; resolved requests may be resubmitted

### Issue Management
- Only project owners can create, edit, and delete issues; members can view and discuss them
- Assign issues to project members
- Set issue priorities: `LOW`, `MEDIUM`, `HIGH`
- Set due dates and descriptions
- Update issue statuses: `TODO`, `IN_PROGRESS`, `DONE`. Only the project owner or current assignee can change status; unassigned issues require the owner. Other members' status menus and drag controls are disabled, and the API enforces the same rule.
- Validate that assignees belong to the project

### Structured Issues
- Optional permanent project keys: 2-10 uppercase letters, globally unique; automatic keys use `PRJ` plus the project ID
- Readable issue keys such as `WEB-1`, using a transactionally locked per-project counter; deleting issues never reuses numbers
- Existing projects retain generated keys and existing issues retain their original IDs as issue numbers; the first new issue starts above the highest existing number
- Owner-managed Bug, Task, and Story types, optional story points (1, 2, 3, 5, 8, 13), and up to 10 labels
- Labels use 1-30 letters, digits, hyphens or underscores; normalized to lowercase, deduplicated and sorted
- Metadata changes appear in activity history; owner/assignee status permissions remain unchanged
- Filter the board by type and search titles, issue keys, or labels
- Open a shareable issue URL such as `/#project=1&issue=2`; login and project membership are still required, and stale targets show an error
- Existing rows need no destructive backfill. Hibernate's current `ddl-auto=update` adds nullable metadata columns and unique key constraints at startup; Flyway remains a future production improvement

### Epics and Subtasks
- Three-level hierarchy: Epic > Story/Task/Bug > Subtask; standard issues can also stay outside an epic
- Owners create epics and subtasks, link/reparent issues, and manage all metadata; owner/current-assignee status permissions and member discussion remain unchanged
- An Epics view shows grouped work, nested subtasks, direct-child completion percentages and completed estimated points
- Issue details include parent navigation, child navigation, add-child actions and a separate permission-controlled status menu
- Subtasks require a standard issue parent and inherit that parent's sprint; epics span sprints and are not allocated to a sprint
- Only stories, tasks and bugs appear as independently ordered/planned work; their subtasks appear on the sprint board
- Estimates stay on standard issues. Epics and subtasks have no story points, so sprint commitments/reports count parent issues once
- Marking a parent done requires all direct children done; reopen completed ancestors before reopening a child or adding unfinished work
- Parent links must stay in the same project and cannot point to the issue itself, form cycles or skip hierarchy levels
- Epic and Subtask types cannot be converted after creation; standard Bug/Task/Story types remain editable
- Parent changes appear in activity history. Deleting a parent requires moving or deleting its children first; deleting a project removes its full hierarchy
- New parent links are nullable, preserving existing ungrouped issues; issue types use VARCHAR storage to support the expanded type set on existing MySQL installations

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

### Backlog and Sprint Planning
- Separate All issues, Backlog, and Sprint board views, with explicit planning refresh and failed-load recovery
- Ordered backlog of unfinished issues outside a sprint; owners reorder with accessible up/down controls
- Existing issues use their IDs as initial ordering; new issues append to the backlog
- Owners create, edit or delete planned sprints with a name, goal, start date and end date
- Owners move unfinished issues between the backlog and planned/active sprints; planning changes appear in issue activity
- Only one active sprint per project; starting requires unfinished work and captures initial issue/point commitments
- Completing a sprint atomically snapshots the final scope, statuses, estimates and assignees
- Unfinished work returns to the backlog without resetting status; done work remains done
- Completed sprint reports remain unchanged after subsequent issue edits or deletion; completed sprints cannot be edited, reopened or deleted
- Members can view planning and discuss issues; existing owner/assignee status permissions remain unchanged
- Project locks serialize planning with issue/status/membership changes; reorder requests must match the current unfinished backlog membership
- Deleting a project removes its sprint records and snapshots alongside existing issue data
- Activity event fields use a VARCHAR mapping so new event types can be added without relying on a fixed MySQL enum definition; startup schema updates preserve existing values

### Issue Comments
- Project members can read and add plain-text comments in the issue side panel
- Only a comment's author can edit or delete it, including when another member owns the project
- Comments appear oldest first with author names, timestamps, and an edited marker
- Comment text must be nonblank and no longer than 2,000 characters
- Deleting an issue or its project also deletes associated comments

### Issue Activity History
- Project members can read a newest-first timeline in the issue side panel
- Records issue creation and changes to title, description, status, priority, assignee, and due date
- Shows the acting user, timestamp, and previous/new values; unchanged values create no entries
- Activity is recorded in the same transaction as the issue change
- History starts when tracking is added; earlier changes to existing issues are not reconstructed
- History is read-only and is deleted with its issue or project

### In-app Notifications
- A notification bell shows unread counts and the latest 50 notifications, newest first
- New assignments notify the current assignee; assignee status changes notify the owner
- New comments notify the owner and current assignee, excluding the author and duplicate recipients
- Leave requests notify the owner; approvals and rejections notify the requester
- Notifications are saved in MySQL in the same transaction as the triggering change
- Mark one or all notifications as read; only the recipient can read or update their inbox
- Refresh every 30 seconds while the page is visible, on window focus, and when opening the inbox
- Open the related issue or project settings; links are disabled after deletion or loss of access
- Historical notifications remain readable, including approval after a member leaves; no notifications are created for unchanged status/assignment or the actor's own actions

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

The application uses nine core domain entities:

| Entity | Description |
|---|---|
| AppUser | Stores registered users and encrypted password hashes |
| Project | Stores project information and ownership |
| ProjectMembership | Maps users to projects with OWNER/MEMBER roles |
| Issue | Stores tasks, status, priority, assignee, and due date |
| IssueComment | Stores issue discussion, authors, creation timestamps, and edit timestamps |
| IssueActivity | Stores issue changes, actors, timestamps, and previous/new values |
| ProjectLeaveRequest | Stores each member's latest request to leave and its decision status |
| Notification | Stores recipient-specific notifications, historical target IDs, and read timestamps |
| Sprint | Stores planning dates, lifecycle, initial commitments, and embedded immutable completion snapshots |

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
| GET | `/api/projects/{id}` | Retrieve an accessible project |
| PUT | `/api/projects/{id}` | Update project details (owner only) |
| DELETE | `/api/projects/{id}` | Delete owned project |

### Memberships

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/projects/{projectId}/members` | Add member |
| GET | `/api/projects/{projectId}/members` | List project members |
| DELETE | `/api/projects/{projectId}/members/{userId}` | Remove a member and unassign their issues (owner only) |

### Leave Requests

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/projects/{projectId}/leave-requests` | Owners see all latest requests; members see only their own |
| POST | `/api/projects/{projectId}/leave-requests` | Request permission to leave (members only) |
| PATCH | `/api/projects/{projectId}/leave-requests/{requestId}/cancel` | Cancel your pending request |
| PATCH | `/api/projects/{projectId}/leave-requests/{requestId}/approve` | Approve and remove membership (owner only) |
| PATCH | `/api/projects/{projectId}/leave-requests/{requestId}/reject` | Reject while preserving membership (owner only) |

Requests use `PENDING`, `APPROVED`, `REJECTED`, and `CANCELLED` states. A member cannot remove their own membership directly. Removal or approval unassigns their issues in the same transaction and records the owner as the actor in issue activity. Project locks serialize leave decisions, membership changes, and issue assignment changes. Deleting a project also deletes its leave-request records.

### Issues

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/projects/{projectId}/issues` | Create issue (owner only) |
| GET | `/api/projects/{projectId}/issues` | List project issues |
| PUT | `/api/projects/{projectId}/issues/{issueId}` | Update issue (owner only) |
| PATCH | `/api/projects/{projectId}/issues/{issueId}/status` | Change status (owner or current assignee only) |
| DELETE | `/api/projects/{projectId}/issues/{issueId}` | Delete issue (owner only) |

Issue create/update payloads accept `type` (`EPIC`, `STORY`, `TASK`, `BUG`, `SUBTASK`) and optional `parentId`. For example, create an epic with `{ "title": "Authentication", "type": "EPIC" }`, link a story with `{ "title": "Login", "type": "STORY", "parentId": 1, "storyPoints": 5 }`, and add a subtask with `{ "title": "Test login", "type": "SUBTASK", "parentId": 2 }`. Issue responses include `parentId`, `parentKey` and the effective `sprintId`. Set a standard issue's `parentId` to `null` to remove its epic link. Update uses the complete issue metadata payload, including its current parent.

Hierarchy conflicts return an explanatory HTTP 409 response; invalid levels or estimates return 400, and foreign-project parents return 404. Issue mutation errors use a `ProblemDetail` body with a readable `detail` field.

### Planning

All routes require project membership. All mutations require the project owner.

| Method | Endpoint | Description |
|---|---|---|
| GET / POST | `/api/projects/{projectId}/sprints` | List sprints / create a planned sprint |
| PUT / DELETE | `/api/projects/{projectId}/sprints/{sprintId}` | Edit / delete a planned sprint |
| PATCH | `/api/projects/{projectId}/sprints/{sprintId}/start` | Start a planned sprint; one active sprint per project |
| PATCH | `/api/projects/{projectId}/sprints/{sprintId}/complete` | Snapshot outcomes and return unfinished work to backlog |
| PATCH | `/api/projects/{projectId}/issues/{issueId}/sprint` | Move unfinished issue using `{ "sprintId": 1 }` or `null` for backlog |
| PUT | `/api/projects/{projectId}/backlog/order` | Set order using `{ "issueIds": [2, 1] }` with the exact current backlog IDs |

Sprint creation and editing use `{ "name": "Iteration 1", "goal": "Deliver login", "startDate": "2026-10-10", "endDate": "2026-10-24" }`. End date must be on or after start date. Starting records the actual timestamp independently of scheduled dates. Dates do not automatically start or complete a sprint.

### Notifications

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/notifications` | Latest 50 notifications and total unread count for the authenticated recipient |
| PATCH | `/api/notifications/{id}/read` | Mark one of your notifications read |
| PATCH | `/api/notifications/read-all` | Mark all your notifications read |

### Comments

All comment routes require project membership and validate that the issue belongs to the project. Updates and deletion additionally require the authenticated user to be the comment's author.

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/projects/{projectId}/issues/{issueId}/comments` | List comments oldest first |
| POST | `/api/projects/{projectId}/issues/{issueId}/comments` | Add a comment using `{ "body": "Comment text" }` |
| PUT | `/api/projects/{projectId}/issues/{issueId}/comments/{commentId}` | Edit your comment |
| DELETE | `/api/projects/{projectId}/issues/{issueId}/comments/{commentId}` | Delete your comment |

### Activity History

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/projects/{projectId}/issues/{issueId}/activity` | List issue activity newest first; requires project membership |

There are no public activity creation, editing, or deletion endpoints. Issue mutations record activity automatically.

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
- Only the project owner can create, edit issue details, or delete issues. Status changes are allowed for the owner and current assignee. Members retain access to issue details, activity, and comments.
- Users cannot assign issues to individuals outside the project.
- Unauthorized project access is rejected by the backend.

## Frontend Verification

From `frontend`, run `npm test`, `npm run lint`, and `npm run build`.
The logic tests use Node.js 22.6 or newer for TypeScript type stripping.

An optional browser check in `frontend/tests/board.browser.mjs` uses Playwright and an installed Chrome browser. Start the Vite dev server, make Playwright available locally or via `NODE_PATH`, then run `node tests/board.browser.mjs` from `frontend`. Set `BOARD_TEST_BROWSER=msedge` to use Edge, or `BOARD_TEST_URL` to override the default `http://127.0.0.1:5173`. This check uses mock API responses and covers owner-only issue details, owner/assignee status permissions, reassignment, and member discussion, filtering, card moves, failed-move rollback, failed-save recovery, issue creation/editing/deletion, mobile overflow, panel dismissal, and load retry. It does not verify the backend or MySQL persistence.

To run the browser check without a preview server, build the frontend first and set `BOARD_TEST_STATIC=1`. The check intercepts the page's requests and serves the local `dist` files and mock API data, including comment creation/editing/deletion, author-only controls, plain-text rendering, failed-save recovery, and read-only activity history with newest-first ordering, previous/new values, empty states, and error retry.

From `backend`, run `./mvnw -Dtest=NotificationServiceTests,IssueStatusPermissionTests,ProjectSettingsServiceTests,ActivityServiceTests,CommentServiceTests,CommentValidationTests test` (or `mvnw.cmd` on Windows) to check project editing, leave permissions and decisions, activity change detection, project access, comment permissions, validation, and deletion cleanup without a database.
If Windows sandbox restrictions interfere with the forked test JVM, add `-DforkCount=0` to that focused test command.

For project settings UI checks, build the frontend, make Playwright available, and run `node tests/project-settings.browser.mjs` from `frontend`. This uses intercepted mock API responses and local build files, covering owner/member controls, edit failure recovery, request/cancel/resubmit/reject/approve, direct removal, board refresh, and access loss.

To explicitly test settings against the configured live MySQL database, run `./mvnw -Dtest=ProjectSettingsMysqlTests -DliveMysqlTests=true -DforkCount=0 test` from `backend`. The integration test creates temporary users and a project, exercises status permissions, reassignment, leave decisions and membership removal, flushes and reloads persisted values, checks preserved comments and activity, and rolls back all test records. It is disabled unless `liveMysqlTests=true` is supplied. App startup may update the database schema under the existing Hibernate `ddl-auto=update` configuration.

For notification UI checks, build the frontend, make Playwright available, and run `node tests/notifications.browser.mjs` from `frontend`. This uses mock API responses to verify unread counts, individual/all read actions, failure recovery, issue/settings navigation, unavailable targets, periodic refresh, and mobile layout. Live MySQL tests also verify persisted notification recipients, self-action suppression, read ownership, and historical notifications after access loss or deletion.

## Future Enhancements

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

Structured issue UI checks: build the frontend, then run `node tests/structured-issues.browser.mjs` with `BOARD_TEST_STATIC=1` and Playwright available. Tests use mock API data. `ActivityServiceTests` covers metadata validation, normalization, audit changes and legacy numbering; the opt-in `ProjectSettingsMysqlTests` also verifies persistence, stable keys, owner-only metadata and number preservation after deletion.

Planning verification: include `PlanningServiceTests` in backend unit checks. The opt-in live MySQL test suite verifies order persistence, lifecycle, permissions, snapshot survival after issue deletion, and project cleanup. Build the frontend and run `node tests/planning.browser.mjs` with Playwright available to check create/edit/move/reorder/start/complete/delete, failure recovery, sprint board filtering, member controls, reports and mobile layout using mock API data.

Hierarchy verification: include `IssueHierarchyTests` and `PlanningServiceTests` in backend unit checks. The opt-in `ProjectSettingsMysqlTests` verifies persisted parent links, inherited sprint membership, permissions, completion rules, parent activity and project cleanup with temporary records that roll back. Build the frontend and run `node tests/hierarchy.browser.mjs` with Playwright available to verify epic/subtask creation, failure recovery, navigation, reparenting, progress, protected deletion, planning scope, member controls and mobile layout using mock API data.
