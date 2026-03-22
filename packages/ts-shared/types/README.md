# @repo/types

Centralized TypeScript types for the Hamina Integrations monorepo.

## Overview

This package provides a single source of truth for all TypeScript types used across the frontend and backend applications. It eliminates type duplication, ensures consistency, and provides proper type inference utilities.

## Structure

```
src/
├── index.ts           # Main exports
├── api/              # API-related types
├── mist/             # Mist API types
├── queue/            # Queue and SSE types  
├── cache/            # Cache-related types
├── common/           # Common utility types
└── inference/        # Type inference utilities
```

## Key Features

### ✅ No `any` Types
All types are properly defined with strict TypeScript settings:
- `exactOptionalPropertyTypes: true`
- `noUncheckedIndexedAccess: true`
- `strict: true`

### ✅ Type Inference Utilities
Use `Awaited<ReturnType<...>>` patterns instead of manual type definitions:

```typescript
// ❌ Bad: Manual type definition
type UserDataResponse = {
  user: { id: string; name: string };
  meta: { total: number };
};

// ✅ Good: Inferred from function
const getUserData = async (id: string) => {
  return { user: { id, name: 'John' }, meta: { total: 1 } };
};
type UserDataResponse = AsyncReturnType<typeof getUserData>;
```

### ✅ Centralized API Types
All API request/response types are defined once:

```typescript
import type { 
  ApiResponse, 
  MistDeviceDetail, 
  InventoryDevice 
} from '@repo/types';

// Consistent across frontend and backend
const response: ApiResponse<MistDeviceDetail[]> = {
  ok: true,
  data: devices,
  meta: { total: 10, page: 1, limit: 10 }
};
```

### ✅ Proper Generic Constraints
Type-safe generics with proper constraints:

```typescript
// Type-safe queue service
const response = await queueService.request<ApiResponse<InventoryDevice[]>>(
  '/api/mist/inventory'
);
// response.data is properly typed as InventoryDevice[] | undefined
```

## Usage Examples

### Backend Services

```typescript
import type { 
  InventoryFilters, 
  ClientStatsOptions,
  AsyncReturnType 
} from '@repo/types';

const getInventory = async (filters?: InventoryFilters) => {
  // Implementation
  return { devices: [], meta: { total: 0, page: 1, limit: 50 } };
};

// Infer return type instead of manual definition
type InventoryReturn = AsyncReturnType<typeof getInventory>;
```

### Frontend Components

```typescript
import type { 
  EnhancedSiteInfo, 
  ApiResponse,
  MistDeviceDetail 
} from '@repo/types';

interface SiteCardProps {
  site: EnhancedSiteInfo;
  onSelect: (siteId: string) => void;
}

// Type-safe API calls
const response = await fetch<ApiResponse<MistDeviceDetail[]>>('/api/devices');
```

### Queue Service

```typescript
import type { 
  QueuedRequest, 
  SSEMessage, 
  QueueServiceStats 
} from '@repo/types';

class QueueService {
  private pendingRequests = new Map<string, QueuedRequest>();
  
  async request<T extends ApiResponse>(url: string): Promise<T> {
    // Type-safe implementation
  }
}
```

## Migration Guide

### From Local Types to Centralized

1. **Remove local type definitions:**
   ```typescript
   // ❌ Remove from individual files
   type MistDevice = { id: string; name: string; };
   ```

2. **Import from @repo/types:**
   ```typescript
   // ✅ Use centralized types
   import type { MistDeviceDetail } from '@repo/types';
   ```

3. **Use type inference:**
   ```typescript
   // ❌ Manual return type
   const getDevices = (): Promise<MistDeviceDetail[]> => { ... }
   
   // ✅ Inferred return type
   const getDevices = async () => { 
     return devices; // TypeScript infers the return type
   };
   type GetDevicesReturn = AsyncReturnType<typeof getDevices>;
   ```

### Eliminating `any` Types

1. **Replace with proper types:**
   ```typescript
   // ❌ Using any
   const data: any = await response.json();
   
   // ✅ Proper typing
   const data: ApiResponse<MistDeviceDetail[]> = await response.json();
   ```

2. **Use unknown for uncertain data:**
   ```typescript
   // ❌ Using any for external data
   const handleData = (data: any) => { ... }
   
   // ✅ Use unknown and type guards
   const handleData = (data: unknown) => {
     if (typeof data === 'object' && data !== null) {
       // Type narrowing
     }
   }
   ```

## Type Inference Patterns

### Service Functions
```typescript
// Define the function first
const fetchUserData = async (id: string) => {
  return { user: { id, name: 'John' }, settings: { theme: 'dark' } };
};

// Then infer the type
type UserDataReturn = AsyncReturnType<typeof fetchUserData>;
// Result: { user: { id: string; name: string }; settings: { theme: string } }
```

### API Responses
```typescript
// Define the API function
const getUsersApi = async () => {
  return { ok: true, data: users, meta: pagination };
};

// Infer the response type
type UsersApiResponse = AsyncReturnType<typeof getUsersApi>;
```

### Component Props
```typescript
// Define the component
const UserCard = (props: { user: User; onEdit: () => void }) => { ... };

// Infer props type
type UserCardProps = InferComponentProps<typeof UserCard>;
```

## Best Practices

1. **Always use centralized types** - Import from `@repo/types`
2. **Prefer type inference** - Use `AsyncReturnType<typeof fn>` over manual types
3. **No `any` types** - Use `unknown` and type guards instead
4. **Proper generics** - Use type constraints for better type safety
5. **Consistent naming** - Follow established naming conventions
6. **Export inference types** - Make return types available for reuse

## Development

```bash
# Type checking
npm run check-types --workspace @repo/types

# Install in other packages
npm install @repo/types --workspace apps/frontend
npm install @repo/types --workspace apps/backend
```

## Dependencies

- TypeScript 5.9+
- Express types (for API types)
- React types (for component inference)