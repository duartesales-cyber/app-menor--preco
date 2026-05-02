# Security Specification - Menor Preço

## Data Invariants
1. A product price entry must have a valid `userId` matching the creator.
2. `createdAt` must be a server-side timestamp.
3. Users can only delete their own price entries.
4. `GlobalStats` document can only be incremented by authenticated users, but never deleted or overwritten blindly. (Note: Firestore rules don't support atomicity checks for increments easily without `getAfter`, but we'll restrict it to certain fields).

## The Dirty Dozen (Attack Scenarios)
1. **Identity Theft**: Attempt to create a product with `userId` of another user.
2. **Shadow Field**: Adding `isVerified: true` to a product.
3. **Price Poisoning**: Setting price to -1.00 or 99999999.
4. **ID Poisoning**: Using a 2KB string as `productId`.
5. **Timeline Fraud**: Setting `createdAt` to a future date from the client.
6. **Stat Reset**: Attempting to set stats to 0.
7. **Unauthenticated Write**: Trying to add a price without being logged in.
8. **Malicious Query**: Trying to list all prices without any filters (if we were restricting by geographic area, but here it's public).
9. **Email Spoofing**: Logged in with unverified email trying to perform admin actions.
10. **Category Injection**: Using "free_stuff" as category instead of "mercado" or "posto".
11. **Bulk Delete**: Attempting to delete all products.
12. **Store Hijacking**: Updating a store's address on a price entry created by someone else.

## Test Cases (Logic)
- `create /products/{id}`: Deny if `request.auth.uid != incoming().userId`.
- `update /products/{id}`: Deny always (prices should probably be immutable or only owner can update specific fields). Let's say only owner can update `price`.
- `update /stats/global`: Only allow incrementing searches/accesses/additions.
