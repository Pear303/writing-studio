/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'vscode-bg': 'var(--color-vscode-bg)',
        'vscode-sidebar': 'var(--color-vscode-sidebar)',
        'vscode-activitybar': 'var(--color-vscode-activitybar)',
        'vscode-border': 'var(--color-vscode-border)',
        'vscode-text': 'var(--color-vscode-text)',
        'vscode-active': 'var(--color-vscode-active)',
        'auth-bg-start': 'var(--color-auth-bg-start)',
        'auth-bg-end': 'var(--color-auth-bg-end)',
        'auth-card-bg': 'var(--color-auth-card-bg)',
        'auth-card-border': 'var(--color-auth-card-border)',
        'auth-text-primary': 'var(--color-auth-text-primary)',
        'auth-text-secondary': 'var(--color-auth-text-secondary)',
        'auth-input-bg': 'var(--color-auth-input-bg)',
        'auth-input-border': 'var(--color-auth-input-border)',
        'auth-input-focus': 'var(--color-auth-input-focus)',
        'auth-button-bg': 'var(--color-auth-button-bg)',
        'auth-button-hover': 'var(--color-auth-button-hover)',
        'auth-link': 'var(--color-auth-link)',
        'auth-link-hover': 'var(--color-auth-link-hover)',
        'auth-error-bg': 'var(--color-auth-error-bg)',
        'auth-error-text': 'var(--color-auth-error-text)',
        'auth-checkbox': 'var(--color-auth-checkbox)',
      },
      width: {
        'activitybar': 'var(--width-activitybar)',
        'sidebar': 'var(--width-sidebar)',
      },
      height: {
        'toolbar': 'var(--height-toolbar)',
        'statusbar': 'var(--height-statusbar)',
      }
    },
  },
  plugins: [],
}
