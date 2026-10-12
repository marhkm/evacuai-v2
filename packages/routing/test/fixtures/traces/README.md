# Recorded barometer traces

CSV files recorded on real phones (Plan 3 dev screen), one per scenario.

- Header row `t_ms,hPa`, then one sample per row (`t_ms` = milliseconds since start).
- Filename pattern `<name>__floors_<n>.csv`, where `<n>` is the expected net floor change
  (`stairs_up__floors_1.csv`, `stairs_down__floors_-1.csv`, `drift__floors_0.csv`).
- `floorChange.test.ts` runs every CSV here with `floorHeight_m: 3.5` and asserts the summed floors equal `<n>`.
