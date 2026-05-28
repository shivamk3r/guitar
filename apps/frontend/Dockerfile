FROM node:22-slim

WORKDIR /workspace

RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/frontend/package.json apps/frontend/package.json
RUN pnpm install --filter @guitar/frontend --frozen-lockfile

COPY apps/frontend apps/frontend

WORKDIR /workspace/apps/frontend
EXPOSE 5173

CMD ["pnpm", "dev"]
