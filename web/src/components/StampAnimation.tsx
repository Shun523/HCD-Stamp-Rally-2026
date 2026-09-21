import type { StampedEvent } from "@hcd-stamp-rally/shared";
import type { Copy } from "../data/content.js";
import { stampAssetPath } from "../data/stamps.js";

type Props = {
  event: StampedEvent;
  copy: Copy;
  onClose: () => void;
};

export function StampAnimation({ event, copy, onClose }: Props) {
  return (
    <section className="overlay" role="dialog" aria-modal="true" aria-labelledby="stamp-earned-title">
      <div className="animation-card">
        <img className="earned-stamp" src={stampAssetPath(event.spot_id)} alt="" />
        <h2 id="stamp-earned-title">{copy.earned}</h2>
        <p>{copy.earnedCount.replace("{count}", String(event.stamp_count))}</p>
        <button className="button" type="button" onClick={onClose}>{copy.close}</button>
      </div>
    </section>
  );
}
