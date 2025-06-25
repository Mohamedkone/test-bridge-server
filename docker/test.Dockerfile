# docker/test.Dockerfile
FROM node:23-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (including dev dependencies for testing)
RUN npm ci

# Copy the rest of the application
COPY . .

# Set environment to test
ENV NODE_ENV=test

# Run tests by default
CMD ["npm", "test"]