# Hamispro.io

A modern full-stack web application built with React, Vite, Express, tRPC, and Drizzle ORM.

## Tech Stack

- **Frontend:** React, Vite, Tailwind CSS, Radix UI, tRPC Client
- **Backend:** Express, Node.js, tRPC Server
- **Database:** MySQL, Drizzle ORM
- **Language:** TypeScript

## Getting Started

### Prerequisites

- Node.js (v18+)
- pnpm (recommended)
- MySQL database

### Installation

1. Clone the repository:
   ```bash
   git clone <your-repo-url>
   cd hamispro-io
   ```

2. Install dependencies:
   ```bash
   pnpm install
   ```

3. Environment Variables:
   Copy `.env.production.example` to `.env` and configure your database and other secrets.
   ```bash
   cp .env.production.example .env
   ```

4. Database Setup:
   Push the schema to your database.
   ```bash
   pnpm run db:push
   ```

### Running Locally

Start the development server:
```bash
pnpm run dev
```

### Build for Production

```bash
pnpm run build
pnpm start
```

## License

MIT License
