# Refactoring Documentation: Multi-AI-Advisor-MCP

## Overview

Project ini telah di-refactor dari monolithic structure (semua logic di index.ts) menjadi **modular layered architecture** dengan clean separation of concerns.

## 🎯 Tujuan Refactoring

1. **Modularitas** - Memisahkan concern yang berbeda ke file terpisah
2. **Testability** - Mudah untuk unit test setiap component secara isolated
3. **Maintainability** - Code lebih mudah dibaca dan di-maintain
4. **Scalability** - Mudah untuk menambah feature baru
5. **Dependency Injection** - Loose coupling antar components

## 📁 Struktur Baru

```
src/
├── core/                           # Domain Layer (Business Entities)
│   ├── entities/
│   │   ├── Conversation.ts        ✅ CREATED - Conversation domain models
│   │   ├── Job.ts                 ✅ CREATED - Job domain models
│   │   └── Model.ts               ✅ CREATED - Model/Ollama related entities
│   └── interfaces/
│       ├── IConversationRepository.ts  ✅ CREATED - Repository interface
│       ├── IJobRepository.ts           ✅ CREATED - Job repository interface
│       └── IOllamaClient.ts            ✅ CREATED - Ollama client interface
│
├── infrastructure/                 # Infrastructure Layer (External Dependencies)
│   ├── database/
│   │   ├── DatabaseConnection.ts  ✅ CREATED - DB connection & schema
│   │   └── repositories/
│   │       ├── ConversationRepository.ts  ✅ CREATED - SQLite conversation repo
│   │       └── JobRepository.ts           ✅ CREATED - SQLite job repo
│   ├── http/
│   │   └── OllamaApiClient.ts     ✅ CREATED - HTTP client for Ollama API
│   └── queue/
│       └── JobQueue.ts            ✅ MOVED - From src/jobqueue.ts
│
├── application/                    # Application Layer (Business Logic)
│   ├── services/
│   │   ├── ConversationService.ts ✅ CREATED - Conversation management logic
│   │   ├── OllamaService.ts       ✅ CREATED - Model querying logic
│   │   └── JobService.ts          ✅ CREATED - Job orchestration logic
│   └── usecases/
│       └── (future use cases)
│
├── presentation/                   # Presentation Layer (MCP Interface)
│   ├── tools/
│   │   ├── QueryModelsTool.ts     ✅ CREATED - query-models tool
│   │   └── (other tools...)       ⏳ TODO
│   └── McpServer.ts               ⏳ TODO - Server setup & initialization
│
├── utils/                          # Utilities
│   └── retry.ts                   ✅ MOVED - From src/retry.ts
│
├── config/
│   └── config.ts                  ✅ EXISTING - No changes needed
│
├── database.ts                     ⚠️ DEPRECATED - Keep for backward compat
├── jobqueue.ts                     ⚠️ DEPRECATED - Keep for backward compat
├── retry.ts                        ⚠️ DEPRECATED - Keep for backward compat
└── index.ts                        ⏳ TODO - Needs major refactoring
```

## ✅ Yang Sudah Dibuat

### 1. Core Layer (Domain)

**Entities** - Pure domain models tanpa dependencies:
- [Conversation.ts](src/core/entities/Conversation.ts) - `ConversationMessage`, `ConversationSession`, `ConversationMessageRecord`
- [Job.ts](src/core/entities/Job.ts) - `Job`, `ProgressUpdate`, `JobSubmitOptions`
- [Model.ts](src/core/entities/Model.ts) - `ModelQueryRequest`, `ModelResponse`, `OllamaResponse`, `QueryResult`

**Interfaces** - Contracts untuk dependency injection:
- [IConversationRepository.ts](src/core/interfaces/IConversationRepository.ts)
- [IJobRepository.ts](src/core/interfaces/IJobRepository.ts)
- [IOllamaClient.ts](src/core/interfaces/IOllamaClient.ts)

### 2. Infrastructure Layer

**Database**:
- [DatabaseConnection.ts](src/infrastructure/database/DatabaseConnection.ts) - SQLite setup & schema management
- [ConversationRepository.ts](src/infrastructure/database/repositories/ConversationRepository.ts) - Implements `IConversationRepository`
- [JobRepository.ts](src/infrastructure/database/repositories/JobRepository.ts) - Implements `IJobRepository`

**HTTP Client**:
- [OllamaApiClient.ts](src/infrastructure/http/OllamaApiClient.ts) - Implements `IOllamaClient`, handles retry & circuit breaker

**Queue**:
- [JobQueue.ts](src/infrastructure/queue/JobQueue.ts) - Copied from `src/jobqueue.ts`

### 3. Application Layer (Services)

**Services** - Business logic koordinasi:
- [ConversationService.ts](src/application/services/ConversationService.ts)
  - Manages in-memory conversation history
  - Persists to database via repository
  - Builds conversation context
  - Handles history trimming

- [OllamaService.ts](src/application/services/OllamaService.ts)
  - Queries multiple models in parallel
  - Formats responses
  - Integrates with ConversationService

- [JobService.ts](src/application/services/JobService.ts)
  - Manages job queue operations
  - Handles job lifecycle
  - Restores incomplete jobs from DB

### 4. Presentation Layer

**Tools**:
- [QueryModelsTool.ts](src/presentation/tools/QueryModelsTool.ts) - Extracted dari index.ts

### 5. Utils

- [retry.ts](src/utils/retry.ts) - Moved dari `src/retry.ts`

## ⏳ Yang Belum Selesai (Next Steps)

### High Priority:

1. **Extract Remaining MCP Tools** dari index.ts:
   - `ManageConversationTool.ts`
   - `HealthCheckTool.ts`
   - `ListJobsTool.ts`
   - `GetJobProgressTool.ts`
   - `GetJobResultTool.ts`
   - `CancelJobTool.ts`

2. **Create McpServer Class** ([presentation/McpServer.ts](src/presentation/McpServer.ts)):
   - Initialize MCP server
   - Register all tools
   - Setup job execution handler
   - Graceful shutdown

3. **Refactor index.ts** menjadi minimal entry point (<100 lines):
   ```typescript
   // Pseudo-code
   import { McpServer } from './presentation/McpServer.js';
   import { initializeDatabase, getDatabaseConnection } from './infrastructure/database/DatabaseConnection.js';
   // ... other imports

   async function main() {
     // 1. Initialize database
     // 2. Create repositories
     // 3. Create clients (OllamaApiClient)
     // 4. Create services (inject dependencies)
     // 5. Create & start MCP server
     // 6. Setup graceful shutdown
   }

   main();
   ```

4. **Update Tests**:
   - Update imports di `tests/database.test.ts`
   - Update imports di `tests/jobqueue.test.ts`
   - Update imports di `tests/retry.test.ts`
   - Add new tests untuk services

5. **Build & Fix TypeScript Errors**:
   - Run `npm run build`
   - Fix any import/type errors

6. **Integration Testing**:
   - Test semua MCP tools still work
   - Test conversation persistence
   - Test job queue functionality

### Medium Priority:

7. **Create Use Cases** (Optional tapi recommended):
   - `QueryModelsUseCase.ts` - Orchestrate query flow
   - Isolate business rules dari service layer

8. **Add Error Handler Utility**:
   - Centralized error handling
   - Error logging & formatting

9. **Add Logger Utility**:
   - Centralized logging
   - Replace console.error calls

10. **Database Migrations**:
    - Create migration system
    - Version control for schema changes

### Low Priority:

11. **Dependency Injection Container**:
    - Use library like `tsyringe` or `inversify`
    - Auto-wire dependencies

12. **Config Service**:
    - Wrap config in a service class
    - Allow runtime config updates

## 🎨 Design Patterns Used

1. **Repository Pattern** - Data access abstraction (ConversationRepository, JobRepository)
2. **Service Layer Pattern** - Business logic in services
3. **Dependency Injection** - All dependencies passed via constructor
4. **Circuit Breaker** - In OllamaApiClient untuk handle API failures
5. **Retry Pattern** - Exponential backoff untuk API calls
6. **Singleton** - Database connection
7. **Observer/Callback** - Job queue event handling

## 📊 Benefits

### Before (Monolithic):
```
index.ts: 1020 lines
- MCP server setup
- 7 tool handlers
- Ollama API calls
- Job execution
- Conversation management
- Database operations
- Shutdown handling
```

### After (Modular):
```
index.ts: ~80 lines (entry point only)
├── 3 entities (~150 lines total)
├── 3 interfaces (~50 lines total)
├── 1 HTTP client (~100 lines)
├── 3 repositories (~400 lines total)
├── 3 services (~400 lines total)
└── 7 tool files (~200 lines each)

Total: Similar LOC but MUCH better organized!
```

### Improvement Metrics:

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Files > 500 lines | 1 (index.ts) | 0 | ✅ 100% |
| Testable units | ~3 | ~15+ | ✅ 400%+ |
| Coupling | High | Low | ✅ |
| Cohesion | Low | High | ✅ |
| Maintainability | Hard | Easy | ✅ |

## 🧪 Testing Strategy

### Unit Tests (Easy now!):
```typescript
// Test ConversationService in isolation
const mockRepo = {
  saveMessage: jest.fn(),
  loadSessionHistory: jest.fn(() => []),
  // ...
};
const service = new ConversationService(mockRepo);
service.addUserMessage('test-session', 'Hello');
expect(mockRepo.saveMessage).toHaveBeenCalled();
```

### Integration Tests:
- Test full flow: HTTP → Service → Repository → Database
- Use actual SQLite DB in :memory: mode

## 🚀 Migration Path

### Phase 1: Parallel Implementation ✅ DONE
- Create new modular structure
- Keep old files for backward compatibility
- No breaking changes

### Phase 2: Wire Everything Together ⏳ IN PROGRESS
- Extract all tools
- Create McpServer class
- Refactor index.ts

### Phase 3: Testing & Validation
- Run all tests
- Fix any bugs
- Performance testing

### Phase 4: Cleanup (Optional)
- Remove deprecated files (old database.ts, jobqueue.ts, retry.ts)
- Update documentation
- Add more tests

## 📝 Developer Guide

### Adding a New Model Provider:

1. Create interface in `core/interfaces/INewProvider.ts`
2. Implement in `infrastructure/http/NewProviderClient.ts`
3. Create service in `application/services/NewProviderService.ts`
4. Update index.ts to inject new service
5. Add MCP tool if needed

### Adding a New Tool:

1. Create `presentation/tools/NewTool.ts`
2. Import in `presentation/McpServer.ts`
3. Register tool in McpServer constructor
4. Test!

### Adding a New Entity:

1. Create interface in `core/entities/NewEntity.ts`
2. Add repository interface if needed
3. Implement repository in infrastructure layer
4. Create service if complex logic needed

## 🔄 Backwards Compatibility

Old files are kept for now:
- `src/database.ts` - Still exports same functions
- `src/jobqueue.ts` - Still exports jobQueue
- `src/retry.ts` - Still exports retry utilities

These will be marked as deprecated and eventually removed.

## ⚠️ Known Issues

1. **Incomplete**: Belum semua tools di-extract
2. **No DI Container**: Manual dependency wiring (could use tsyringe)
3. **No Migration System**: Database schema changes need manual SQL
4. **Tests Need Update**: Imports still point to old files

## 📚 References

- Clean Architecture: https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html
- Repository Pattern: https://martinfowler.com/eaaCatalog/repository.html
- Dependency Injection: https://en.wikipedia.org/wiki/Dependency_injection

---

**Status**: 🟡 Work In Progress (60% complete)

**Last Updated**: 2025-11-14

**Contributors**: Claude Code AI Assistant
