import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from "chart.js";

ChartJS.register(
  ArcElement,
  BarElement,
  CategoryScale,
  LinearScale,
  LineElement,
  PointElement,
  Filler,
  Tooltip,
  Legend,
);

ChartJS.defaults.color = "#94a3b8";
ChartJS.defaults.borderColor = "rgba(148, 163, 184, 0.18)";
ChartJS.defaults.font.family =
  "'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
ChartJS.defaults.font.size = 11;

export const chartTooltip = {
  backgroundColor: "rgba(15, 23, 42, 0.92)",
  padding: 10,
  cornerRadius: 8,
  displayColors: false,
};

export const chartGrid = {
  color: "rgba(148, 163, 184, 0.16)",
};
