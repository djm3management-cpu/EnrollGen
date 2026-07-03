/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: {
          primary: "var(--bg-primary)",
          surface: "var(--bg-surface)",
          elevated: "var(--bg-elevated)",
        },
        text: {
          primary: "var(--text-primary)",
          secondary: "var(--text-secondary)",
          muted: "var(--text-muted)",
          label: "var(--text-label)",
        },
        border: {
          DEFAULT: "var(--border-default)",
          focus: "var(--border-focus)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          hover: "var(--accent-hover)",
        },
        status: {
          live: "var(--status-live)",
          offline: "var(--status-offline)",
          pending: "var(--status-pending)",
        },
        success: "var(--success)",
        danger: "var(--danger)",
        warning: "var(--warning)",
        info: "var(--info)",
        selection: {
          bg: "var(--selection-bg)",
          text: "var(--selection-text)",
        },
        chart: {
          1: "var(--chart-1)",
          2: "var(--chart-2)",
          3: "var(--chart-3)",
          4: "var(--chart-4)",
          5: "var(--chart-5)",
          6: "var(--chart-6)",
          grid: "var(--chart-grid)",
          positive: "var(--chart-positive)",
          negative: "var(--chart-negative)",
        },
      },
    },
  },
};
