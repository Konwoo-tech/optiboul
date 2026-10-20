import { defineConfig } from 'orval';

export default defineConfig({
  optiboul: {
    input: { target: '../../backend/schema.yml' },
    output: {
      mode: 'tags-split',
      target: 'src/generated/endpoints',
      schemas: 'src/generated/model',
      client: 'react-query',
      httpClient: 'fetch',
      clean: true,
      override: {
        mutator: { path: './src/http.ts', name: 'optiboulFetch' },
      },
    },
  },
});
