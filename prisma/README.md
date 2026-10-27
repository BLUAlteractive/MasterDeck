# Database workspace

B001 supplies local PostgreSQL through root `compose.yaml`. There is intentionally no executable schema or migration yet. B004 will create `prisma/schema.prisma`, migrations and seeds after B003 defines persistence conventions.

`architecture/schema.prisma` is a planning draft, not an executable migration. Do not copy or deploy it blindly. `DATABASE_URL` is reserved in the API template; B001 does not read or write database data.
