// OpenAPI 3.0.4 specification for the Epifi Notes API.
// Served as JSON at GET /openapi.json — plug into any Swagger/OpenAPI viewer.

const PORT = Number(process.env.PORT) || 8000;

const messageResponse = {
    type: "object",
    properties: { message: { type: "string" } },
    required: ["message"],
};

const userPublic = {
    type: "object",
    properties: {
        id: { type: "integer", example: 1 },
        name: { type: "string", example: "Alice" },
        email: { type: "string", format: "email", example: "alice@example.com" },
        createdAt: { type: "string", format: "date-time" },
    },
    required: ["id", "name", "email"],
};

const sharedWithUser = {
    type: "object",
    properties: {
        id: { type: "integer" },
        name: { type: "string" },
        email: { type: "string", format: "email" },
        sharedAt: { type: "string", format: "date-time" },
    },
    required: ["id", "email"],
};

const note = {
    type: "object",
    properties: {
        id: { type: "integer", example: 17 },
        userId: { type: "integer", description: "Owner user id (foreign key)" },
        title: { type: "string", nullable: true, example: "Groceries" },
        type: { type: "string", enum: ["text", "image", "list"], example: "text" },
        note: { type: "string", nullable: true, description: "Body text (required when type='text')." },
        images: {
            type: "array",
            nullable: true,
            items: { type: "string", format: "uri" },
            description: "Required (non-empty) when type='image'. Plain Postgres TEXT[].",
        },
        lists: {
            nullable: true,
            description: "Required (non-empty) when type='list'. JSONB array of items (strings or objects).",
        },
        role: { type: "string", enum: ["owner", "shared"], description: "Caller's relationship to this note." },
        owner: { $ref: "#/components/schemas/UserPublic" },
        sharedWith: { type: "array", items: { $ref: "#/components/schemas/SharedWithUser" } },
        createdAt: { type: "string", format: "date-time" },
        updatedAt: { type: "string", format: "date-time" },
        deletedAt: { type: "string", format: "date-time", nullable: true },
    },
};

const pagination = {
    type: "object",
    properties: {
        page: { type: "integer", example: 1 },
        limit: { type: "integer", example: 20 },
        count: { type: "integer", example: 47 },
        totalPages: { type: "integer", example: 3 },
    },
};

const noteListResponse = {
    type: "object",
    properties: {
        message: { type: "string" },
        rows: { type: "array", items: { $ref: "#/components/schemas/Note" } },
        pagination: { $ref: "#/components/schemas/Pagination" },
        q: { type: "string", description: "Echoed back only when ?q= was provided." },
    },
};

const assignResult = {
    type: "object",
    properties: {
        email: { type: "string", format: "email" },
        status: {
            type: "string",
            enum: ["shared", "already_shared", "user_not_found", "skipped_self", "error"],
        },
        error: { type: "string", description: "Present only when status='error'." },
    },
};

const errorResponse = {
    description: "Standard error envelope.",
    content: { "application/json": { schema: messageResponse } },
};

const openapi = {
    openapi: "3.0.4",
    info: {
        title: "Epifi Notes API",
        description:
            "Backend for the Epifi Notes app. Provides authentication, notes CRUD (text / image / list), sharing with notifications, soft-delete with a 7-day bin, and real-time updates over Socket.IO. " +
            "All responses include a `message` field. Authenticated routes accept the JWT either in the `Authorization: Bearer <token>` header or as a `token` httpOnly cookie set by login.",
        version: "1.0.0",
        contact: { name: "Epifi Notes" },
    },
    servers: [
        { url: `http://localhost:${PORT}`, description: "Local dev" },
        { url: "http://localhost:8000", description: "Default (docker-compose backend)" },
    ],
    tags: [
        { name: "Auth", description: "Register, login, logout, session lookup." },
        { name: "Notes", description: "Create, read, update, delete (soft), search, paginate, bin operations." },
        { name: "Sharing", description: "Owner-only operations to share notes by email." },
        { name: "System", description: "Health check and metadata." },
    ],
    components: {
        securitySchemes: {
            bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
            cookieAuth: { type: "apiKey", in: "cookie", name: "token" },
        },
        schemas: {
            Message: messageResponse,
            UserPublic: userPublic,
            SharedWithUser: sharedWithUser,
            Note: note,
            Pagination: pagination,
            NoteListResponse: noteListResponse,
            AssignResult: assignResult,
            RegisterRequest: {
                type: "object",
                required: ["name", "email", "password"],
                properties: {
                    name: { type: "string", example: "Vishal" },
                    email: { type: "string", format: "email" },
                    password: { type: "string", format: "password", minLength: 6 },
                },
            },
            LoginRequest: {
                type: "object",
                required: ["email", "password"],
                properties: {
                    email: { type: "string", format: "email" },
                    password: { type: "string", format: "password" },
                },
            },
            AuthResponse: {
                type: "object",
                properties: {
                    message: { type: "string" },
                    user: { $ref: "#/components/schemas/UserPublic" },
                    token: { type: "string", description: "JWT. Also set as httpOnly cookie 'token'." },
                },
            },
            NoteCreateRequest: {
                type: "object",
                required: ["type"],
                properties: {
                    title: { type: "string", nullable: true },
                    type: { type: "string", enum: ["text", "image", "list"] },
                    note: { type: "string", nullable: true, description: "Required when type='text'." },
                    images: { type: "array", items: { type: "string", format: "uri" }, description: "Required (non-empty) when type='image'." },
                    lists: { description: "Required (non-empty) when type='list'." },
                },
            },
            NoteUpdateRequest: {
                type: "object",
                description: "Partial update: only fields present are written.",
                properties: {
                    title: { type: "string", nullable: true },
                    type: { type: "string", enum: ["text", "image", "list"] },
                    note: { type: "string", nullable: true },
                    images: { type: "array", items: { type: "string", format: "uri" } },
                    lists: {},
                },
            },
            AssignRequest: {
                type: "object",
                required: ["noteId"],
                properties: {
                    noteId: { type: "integer", example: 17 },
                    emails: { type: "array", items: { type: "string", format: "email" }, maxItems: 50 },
                    email: { type: "string", format: "email", description: "Legacy single-recipient shape. Use `emails` for bulk." },
                },
            },
            AssignResponse: {
                type: "object",
                properties: {
                    message: { type: "string" },
                    results: { type: "array", items: { $ref: "#/components/schemas/AssignResult" } },
                },
            },
        },
        responses: {
            Unauthorized: { description: "Missing or invalid token.", content: { "application/json": { schema: messageResponse } } },
            Forbidden: { description: "Authenticated but not allowed.", content: { "application/json": { schema: messageResponse } } },
            NotFound: { description: "Resource not found.", content: { "application/json": { schema: messageResponse } } },
            ValidationError: { description: "Invalid input.", content: { "application/json": { schema: messageResponse } } },
            ServerError: { description: "Unhandled server error.", content: { "application/json": { schema: messageResponse } } },
        },
    },
    paths: {
        "/health": {
            get: {
                tags: ["System"],
                summary: "Liveness + DB reachability probe.",
                responses: {
                    "200": {
                        description: "Server is up and Postgres is reachable.",
                        content: {
                            "application/json": {
                                schema: {
                                    type: "object",
                                    properties: { status: { type: "string", example: "ok" }, db: { type: "string", example: "connected" } },
                                },
                            },
                        },
                    },
                    "503": {
                        description: "Server is up but Postgres is unreachable.",
                        content: {
                            "application/json": {
                                schema: {
                                    type: "object",
                                    properties: { status: { type: "string", example: "degraded" }, db: { type: "string", example: "disconnected" } },
                                },
                            },
                        },
                    },
                },
            },
        },
        "/openapi.json": {
            get: {
                tags: ["System"],
                summary: "Returns this OpenAPI document.",
                responses: { "200": { description: "OpenAPI 3.0.4 spec", content: { "application/json": { schema: { type: "object" } } } } },
            },
        },
        "/v1/api/auth/register": {
            post: {
                tags: ["Auth"],
                summary: "Create a new account.",
                requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/RegisterRequest" } } } },
                responses: {
                    "201": { description: "Account created.", content: { "application/json": { schema: { $ref: "#/components/schemas/AuthResponse" } } } },
                    "400": { $ref: "#/components/responses/ValidationError" },
                    "409": { description: "Email already registered.", content: { "application/json": { schema: messageResponse } } },
                    "500": { $ref: "#/components/responses/ServerError" },
                },
            },
        },
        "/v1/api/auth/login": {
            post: {
                tags: ["Auth"],
                summary: "Exchange credentials for a JWT.",
                requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/LoginRequest" } } } },
                responses: {
                    "200": { description: "Login OK; sets `token` cookie and returns it.", content: { "application/json": { schema: { $ref: "#/components/schemas/AuthResponse" } } } },
                    "400": { $ref: "#/components/responses/ValidationError" },
                    "401": { $ref: "#/components/responses/Unauthorized" },
                    "500": { $ref: "#/components/responses/ServerError" },
                },
            },
        },
        "/v1/api/auth/logout": {
            post: {
                tags: ["Auth"],
                summary: "Clear the auth cookie.",
                responses: { "200": { description: "OK.", content: { "application/json": { schema: messageResponse } } } },
            },
        },
        "/v1/api/auth/me": {
            get: {
                tags: ["Auth"],
                summary: "Current authenticated user.",
                security: [{ bearerAuth: [] }, { cookieAuth: [] }],
                responses: {
                    "200": {
                        description: "Current user.",
                        content: {
                            "application/json": {
                                schema: {
                                    type: "object",
                                    properties: { message: { type: "string" }, user: { $ref: "#/components/schemas/UserPublic" } },
                                },
                            },
                        },
                    },
                    "401": { $ref: "#/components/responses/Unauthorized" },
                    "404": { $ref: "#/components/responses/NotFound" },
                },
            },
        },
        "/v1/api/notes": {
            post: {
                tags: ["Notes"],
                summary: "Create a new note owned by the caller.",
                security: [{ bearerAuth: [] }, { cookieAuth: [] }],
                requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/NoteCreateRequest" } } } },
                responses: {
                    "201": {
                        description: "Created.",
                        content: {
                            "application/json": {
                                schema: { type: "object", properties: { message: { type: "string" }, note: { $ref: "#/components/schemas/Note" } } },
                            },
                        },
                    },
                    "400": { $ref: "#/components/responses/ValidationError" },
                    "401": { $ref: "#/components/responses/Unauthorized" },
                    "500": { $ref: "#/components/responses/ServerError" },
                },
            },
            get: {
                tags: ["Notes"],
                summary: "Paginated list of owned + shared notes, with optional search.",
                security: [{ bearerAuth: [] }, { cookieAuth: [] }],
                parameters: [
                    { name: "page",  in: "query", schema: { type: "integer", minimum: 1, default: 1 } },
                    { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 20 } },
                    { name: "q",     in: "query", schema: { type: "string" }, description: "Case-insensitive substring match across `title` and `note`." },
                ],
                responses: {
                    "200": { description: "OK.", content: { "application/json": { schema: { $ref: "#/components/schemas/NoteListResponse" } } } },
                    "401": { $ref: "#/components/responses/Unauthorized" },
                    "500": { $ref: "#/components/responses/ServerError" },
                },
            },
        },
        "/v1/api/notes/search": {
            get: {
                tags: ["Notes"],
                summary: "Alias of GET /v1/api/notes — same handler, clearer URL for searches.",
                security: [{ bearerAuth: [] }, { cookieAuth: [] }],
                parameters: [
                    { name: "q",     in: "query", schema: { type: "string" }, required: false },
                    { name: "page",  in: "query", schema: { type: "integer", minimum: 1, default: 1 } },
                    { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 20 } },
                ],
                responses: {
                    "200": { description: "OK.", content: { "application/json": { schema: { $ref: "#/components/schemas/NoteListResponse" } } } },
                    "401": { $ref: "#/components/responses/Unauthorized" },
                },
            },
        },
        "/v1/api/notes/bin": {
            get: {
                tags: ["Notes"],
                summary: "Notes the caller soft-deleted, within the 7-day retention window.",
                security: [{ bearerAuth: [] }, { cookieAuth: [] }],
                parameters: [
                    { name: "page",  in: "query", schema: { type: "integer", minimum: 1, default: 1 } },
                    { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 20 } },
                ],
                responses: {
                    "200": {
                        description: "OK.",
                        content: {
                            "application/json": {
                                schema: {
                                    allOf: [
                                        { $ref: "#/components/schemas/NoteListResponse" },
                                        { type: "object", properties: { retentionDays: { type: "integer", example: 7 } } },
                                    ],
                                },
                            },
                        },
                    },
                    "401": { $ref: "#/components/responses/Unauthorized" },
                },
            },
        },
        "/v1/api/notes/assign": {
            post: {
                tags: ["Sharing"],
                summary: "Owner shares a note with one or more users (by email).",
                description: "Sends a Gmail notification to each recipient and emits a Socket.IO `note:shared` event. Capped at 50 recipients per request.",
                security: [{ bearerAuth: [] }, { cookieAuth: [] }],
                requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/AssignRequest" } } } },
                responses: {
                    "200": { description: "OK. Per-recipient results in `results`.", content: { "application/json": { schema: { $ref: "#/components/schemas/AssignResponse" } } } },
                    "400": { $ref: "#/components/responses/ValidationError" },
                    "401": { $ref: "#/components/responses/Unauthorized" },
                    "403": { $ref: "#/components/responses/Forbidden" },
                    "404": { $ref: "#/components/responses/NotFound" },
                },
            },
        },
        "/v1/api/notes/{id}": {
            parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer", minimum: 1 } }],
            get: {
                tags: ["Notes"],
                summary: "Fetch a single note (owner or any shared user).",
                security: [{ bearerAuth: [] }, { cookieAuth: [] }],
                responses: {
                    "200": {
                        description: "OK.",
                        content: {
                            "application/json": {
                                schema: {
                                    type: "object",
                                    properties: { message: { type: "string" }, note: { $ref: "#/components/schemas/Note" }, role: { type: "string", enum: ["owner", "shared"] } },
                                },
                            },
                        },
                    },
                    "400": { $ref: "#/components/responses/ValidationError" },
                    "401": { $ref: "#/components/responses/Unauthorized" },
                    "403": { $ref: "#/components/responses/Forbidden" },
                    "404": { $ref: "#/components/responses/NotFound" },
                },
            },
            put: {
                tags: ["Notes"],
                summary: "Update a note. Owner or any shared user can edit.",
                security: [{ bearerAuth: [] }, { cookieAuth: [] }],
                requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/NoteUpdateRequest" } } } },
                responses: {
                    "200": {
                        description: "Updated.",
                        content: {
                            "application/json": {
                                schema: { type: "object", properties: { message: { type: "string" }, note: { $ref: "#/components/schemas/Note" } } },
                            },
                        },
                    },
                    "400": { $ref: "#/components/responses/ValidationError" },
                    "401": { $ref: "#/components/responses/Unauthorized" },
                    "403": { $ref: "#/components/responses/Forbidden" },
                    "404": { $ref: "#/components/responses/NotFound" },
                },
            },
            delete: {
                tags: ["Notes"],
                summary: "Owner: soft-delete the note (moves to bin for 7 days, drops shares). Shared user: remove the note from their list only.",
                security: [{ bearerAuth: [] }, { cookieAuth: [] }],
                responses: {
                    "200": { description: "OK.", content: { "application/json": { schema: messageResponse } } },
                    "400": { $ref: "#/components/responses/ValidationError" },
                    "401": { $ref: "#/components/responses/Unauthorized" },
                    "403": { $ref: "#/components/responses/Forbidden" },
                    "404": { $ref: "#/components/responses/NotFound" },
                },
            },
        },
        "/v1/api/notes/{id}/restore": {
            parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer", minimum: 1 } }],
            post: {
                tags: ["Notes"],
                summary: "Restore a note from the bin (owner only, within the retention window).",
                security: [{ bearerAuth: [] }, { cookieAuth: [] }],
                responses: {
                    "200": {
                        description: "Restored.",
                        content: {
                            "application/json": {
                                schema: { type: "object", properties: { message: { type: "string" }, note: { $ref: "#/components/schemas/Note" } } },
                            },
                        },
                    },
                    "400": { $ref: "#/components/responses/ValidationError" },
                    "401": { $ref: "#/components/responses/Unauthorized" },
                    "403": { $ref: "#/components/responses/Forbidden" },
                    "404": { $ref: "#/components/responses/NotFound" },
                    "410": { description: "Bin retention window has expired.", content: { "application/json": { schema: messageResponse } } },
                },
            },
        },
        "/v1/api/notes/{id}/permanent": {
            parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer", minimum: 1 } }],
            delete: {
                tags: ["Notes"],
                summary: "Permanently delete a note (owner only; skips the bin).",
                security: [{ bearerAuth: [] }, { cookieAuth: [] }],
                responses: {
                    "200": { description: "Deleted.", content: { "application/json": { schema: messageResponse } } },
                    "400": { $ref: "#/components/responses/ValidationError" },
                    "401": { $ref: "#/components/responses/Unauthorized" },
                    "403": { $ref: "#/components/responses/Forbidden" },
                    "404": { $ref: "#/components/responses/NotFound" },
                },
            },
        },
    },
};

module.exports = openapi;
