/** Three dots that hop in turn after a label while its work runs; still dots when motion is off. */
export function BusyDots() {
  return (
    <span className="busy-dots" aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  )
}
