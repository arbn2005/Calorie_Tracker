import { useState } from "react";
import { BarcodeScanner } from "../../components/BarcodeScanner";
import { NutrientGrid } from "../../components/NutrientGrid";
import { findFoodByBarcode } from "../../db/data";
import { useTranslation } from "../../i18n";
import { round } from "../../lib/utils";
import type { FoodWithMeta } from "../../types";

interface ScanTabProps {
  onSelect: (food: FoodWithMeta) => void;
  onManual: (barcode: string) => void;
}

export function ScanTab({ onSelect, onManual }: ScanTabProps) {
  const { t } = useTranslation();
  const [scanning, setScanning] = useState(false);
  const [cameraError, setCameraError] = useState(false);
  const [barcode, setBarcode] = useState("");
  const [looking, setLooking] = useState(false);
  const [product, setProduct] = useState<FoodWithMeta | null>(null);
  const [notFound, setNotFound] = useState<string | null>(null);

  async function lookup(value: string) {
    const clean = value.trim();
    if (!clean) return;
    setScanning(false);
    setLooking(true);
    setNotFound(null);
    setProduct(null);
    try {
      const food = await findFoodByBarcode(clean);
      if (food) setProduct(food);
      else setNotFound(clean);
    } finally {
      setLooking(false);
    }
  }

  function reset() {
    setProduct(null);
    setNotFound(null);
    setBarcode("");
    setCameraError(false);
    setScanning(false);
  }

  return (
    <div className="tab-panel">
      <section className="scan-card">
        <div className="card-head">
          <div>
            <h2>{t("add.scanTitle")}</h2>
            <p className="muted small">{t("add.scanHint")}</p>
          </div>
        </div>

        {scanning ? (
          <>
            <BarcodeScanner
              onDetected={(value) => void lookup(value)}
              onCameraError={() => {
                setScanning(false);
                setCameraError(true);
              }}
            />
            <button
              type="button"
              className="btn btn-secondary btn-block"
              onClick={() => setScanning(false)}
            >
              {t("add.stopCamera")}
            </button>
          </>
        ) : (
          <button
            type="button"
            className="btn btn-primary btn-block"
            onClick={() => {
              setCameraError(false);
              setScanning(true);
            }}
          >
            {t("add.startCamera")}
          </button>
        )}

        {cameraError ? (
          <p className="muted small">{t("add.cameraUnsupported")}</p>
        ) : null}
      </section>

      <section className="card">
        <div className="card-head">
          <h2>{t("add.lookup")}</h2>
        </div>
        <p className="muted small">{t("add.lookupHint")}</p>
        <form
          className="inline-form"
          onSubmit={(event) => {
            event.preventDefault();
            void lookup(barcode);
          }}
        >
          <input
            type="text"
            inputMode="numeric"
            value={barcode}
            onChange={(event) => setBarcode(event.target.value)}
            placeholder={t("add.barcode")}
            aria-label={t("add.barcode")}
          />
          <button
            type="submit"
            className="btn btn-primary"
            disabled={looking || !barcode.trim()}
          >
            {looking ? t("add.lookingUp") : t("add.lookup")}
          </button>
        </form>
        {!navigator.onLine ? <p className="muted small">{t("add.offline")}</p> : null}
      </section>

      {product ? (
        <section className="card product-card">
          <div className="card-head">
            <div>
              <h2>{product.name}</h2>
              <p className="muted small">
                {product.brand ? `${product.brand} · ` : ""}
                {t(`categories.${product.category}`)}
              </p>
            </div>
          </div>
          <NutrientGrid nutrients={product} compact />
          {product.packetGrams ? (
            <p className="muted small">
              {t("add.packetValues", {
                grams: round(product.packetGrams, 0),
                kcal: Math.round((product.kcal * product.packetGrams) / 100),
              })}
            </p>
          ) : null}
          <p className="muted small">{t("add.scanSource")}</p>
          <div className="button-row">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => onSelect(product)}
            >
              {t("add.useProduct")}
            </button>
            <button type="button" className="btn btn-secondary" onClick={reset}>
              {t("add.scanAgain")}
            </button>
          </div>
        </section>
      ) : null}

      {notFound ? (
        <section className="card">
          <div className="card-head">
            <h2>{t("add.notFound")}</h2>
          </div>
          <p className="muted small">{t("add.notFoundHint")}</p>
          <div className="button-row">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => onManual(notFound)}
            >
              {t("add.manualWithBarcode")}
            </button>
            <button type="button" className="btn btn-secondary" onClick={reset}>
              {t("add.scanAgain")}
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
