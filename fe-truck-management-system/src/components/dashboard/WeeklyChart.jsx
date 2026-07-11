const values = [42, 62, 48, 76, 88, 66, 80];
const days = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];

function WeeklyChart() {
  return (
    <div className="bar-chart" aria-label="Grafik perjalanan mingguan">
      {values.map((value, index) => (
        <div className="bar-column" key={days[index]}>
          <div className="bar-track">
            <div className="bar-value" style={{ height: `${value}%` }} />
          </div>
          <span>{days[index]}</span>
        </div>
      ))}
    </div>
  );
}

export default WeeklyChart;
