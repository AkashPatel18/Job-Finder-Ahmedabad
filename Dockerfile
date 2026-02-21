# Dockerfile for GCP Cloud Run
# Lightweight - only serves the companies directory

FROM node:20-slim

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install tsx typescript

# Create directories and copy source
RUN mkdir -p src/data
COPY src/companies-server.ts ./src/
COPY src/data/companies.json ./src/data/

# Cloud Run uses PORT env variable (default 8080)
ENV PORT=8080
ENV NODE_ENV=production

# Expose port
EXPOSE 8080

# Start the server
CMD ["npx", "tsx", "src/companies-server.ts"]
