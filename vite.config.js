import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        home: resolve(__dirname, 'index.html'),
        about: resolve(__dirname, 'about.html'),
        academics: resolve(__dirname, 'academics.html'),
        sports: resolve(__dirname, 'sports.html'),
        admissions: resolve(__dirname, 'admissions.html'),
        policies: resolve(__dirname, 'policies.html'),
        contact: resolve(__dirname, 'contact.html'),
        admin: resolve(__dirname, 'admin.html'),
        emailTester: resolve(__dirname, 'email-tester.html')
      }
    }
  }
});
