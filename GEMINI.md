## Project Overview

This is a Node.js project that acts as a Model Context Protocol (MCP) server. It's designed to query multiple Ollama models simultaneously and synthesize their responses. This allows for a "council of advisors" approach to answering questions, providing diverse perspectives. The server is intended to be used with Claude for Desktop.

The project is written in TypeScript and uses the `@modelcontextprotocol/sdk` for MCP communication. It also uses `better-sqlite3` for database storage, `node-fetch` for making requests to the Ollama API, and `zod` for data validation.

## Building and Running

### Building the project

To build the project, run the following command:

```bash
npm run build
```

This will compile the TypeScript code to JavaScript and place it in the `build` directory.

### Running the project

To run the server, use the following command:

```bash
npm start
```

This will start the MCP server. You can also use the following command to start the server in debug mode:

```bash
npm run start:debug
```

### Testing the project

To run the tests, use the following command:

```bash
npm test
```

## Development Conventions

*   **Code Style:** The project uses TypeScript and seems to follow standard TypeScript conventions.
*   **Testing:** The project uses Jest for testing. Test files are located in the `tests` directory and have the `.test.ts` extension.
*   **Database:** The project uses a SQLite database to store conversation history. The database is initialized in `src/database.ts`.
*   **Asynchronous Tasks:** The project uses a job queue to handle asynchronous tasks like querying the Ollama models. The job queue is implemented in `src/jobqueue.ts`.
*   **Error Handling:** The project uses a circuit breaker pattern to handle failures when communicating with the Ollama API. The circuit breaker is implemented in `src/retry.ts`.
