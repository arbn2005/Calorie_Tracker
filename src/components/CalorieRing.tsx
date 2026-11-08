import { Doughnut } from "react-chartjs-2";
import { useTranslation } from "../i18n";

interface CalorieRingProps {
  eaten: number;
  goal: number;
}

export function CalorieRing({ eaten, goal }: CalorieRingProps) {
  const { t } = useTranslation();
  const over = eaten > goal;
  const data = {
    labels: ["eaten", "remaining"],
    datasets: [
      {
        data: over
          ? [goal, eaten - goal]
          : [Math.min(eaten, goal), Math.max(goal - eaten, 0)],
        backgroundColor: over
          ? ["#16a34a", "#ef4444"]
          : ["#16a34a", "rgba(148, 163, 184, 0.22)"],
        borderWidth: 0,
        hoverOffset: 0,
        spacing: 0,
      },
    ],
  };

  return (
    <div className="ring-wrap">
      <Doughnut
        data={data}
        options={{
          cutout: "78%",
          responsive: true,
          maintainAspectRatio: false,
          animation: { duration: 500 },
          plugins: {
            legend: { display: false },
            tooltip: { enabled: false },
          },
        }}
      />
      <div className="ring-center">
        <strong>{Math.round(eaten)}</strong>
        <small>{t("today.ofGoal", { goal: Math.round(goal) })}</small>
      </div>
    </div>
  );
}
