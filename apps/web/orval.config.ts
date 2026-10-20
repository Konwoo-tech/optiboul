import { defineConfig } from 'orval';

export default defineConfig({
  optiboul: {
    input: { target: '../api/schema.yml' },
    output: {
      mode: 'tags-split',
      target: 'src/api/generated/endpoints',
      schemas: 'src/api/generated/model',
      client: 'react-query',
      httpClient: 'fetch',
      clean: true,
      override: {
        mutator: { path: './src/api/http.ts', name: 'optiboulFetch' },
      },
    },
  },
});
