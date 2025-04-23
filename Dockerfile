# ---- Builder Stage ----
FROM node:22-slim AS builder

# Set working directory
WORKDIR /app

# Install dependencies
# Copy package files first for better caching
COPY package.json package-lock.json* ./
# Install all dependencies (including devDependencies needed for build)
RUN npm install --production=false

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Remove devDependencies after build
RUN npm prune --production


# ---- Final Stage ----
FROM node:22-slim

ENV NODE_ENV=production \
    PATH="/home/service-user/.local/bin:${PATH}" \
    OBSIDIAN_API_KEY="abc"

# Install mcp-proxy globally for runtime use
# Combine update, install, and clean in one layer
RUN apt-get update && \
    apt-get install -y --no-install-recommends curl && \
    npm install -g mcp-proxy@2.10.6 && \
    npm cache clean --force && \
    apt-get purge -y --auto-remove curl && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# Create non-root user and group
# Create app directory and set permissions
RUN groupadd --system --gid 1987 service-user && \
    useradd --system --uid 1987 --gid service-user -m service-user && \
    mkdir -p /app && \
    chown -R service-user:service-user /app

# Set working directory
WORKDIR /app

# Copy necessary artifacts from builder stage
COPY --from=builder --chown=service-user:service-user /app/package.json ./package.json
COPY --from=builder --chown=service-user:service-user /app/node_modules ./node_modules
COPY --from=builder --chown=service-user:service-user /app/build ./build

# Switch to non-root user
USER service-user

# Expose port if necessary (Update port number if your app uses a different one)
# EXPOSE 3000

# Define the command to run the application
# CMD ["mcp-proxy", "node", "build/index.js"] # Keep original for reference
CMD ["node", "build/index.js"]