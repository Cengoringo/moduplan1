'use client';
import React, { useRef, useState, useEffect } from "react";
import { Canvas } from "@react-three/fiber";
import { Grid, OrbitControls, Html } from "@react-three/drei";
import * as THREE from "three";
import { exportObjectToGLB } from "../lib/export-glb";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

// ─── Tipler ──────────────────────────────────────────────────────────────────

type RoomSize = {
  width: number;  // cm
  depth: number;  // cm
  height: number; // cm
};

type CabinetVariant = "drawerWardrobe" | "multiShelf" | "wardrobe" | "custom";

type MaterialType = "mdflam" | "lake" | "akrilik";

type CustomSection = {
  id: number;
  type: "shelf" | "drawer" | "hanger" | "open";
  heightCm: number;
};

type Cabinet = {
  id: number;
  x: number;
  z: number;
  variant: CabinetVariant;
  heightRatio: number;
  widthFactor: number;
  depthFactor: number;
  rotation: number;
  material: MaterialType;
  colorHex: string;
  shelfSpacingCm: number;
  customSections?: CustomSection[];
  hasDoor: boolean;
  lockedTo: number | null;
  shelfHeightsCm?: number[]; // multiShelf: bölüm yükseklikleri (üstten alta)
}

type SavedLayout = {
  name: string;
  cabinets: Cabinet[];
  room: RoomSize;
  savedAt: number;
};

const STORAGE_KEY = "moduplan-saved-layouts";

// ─── Kaplama Tanımları ────────────────────────────────────────────────────────

type MaterialDef = {
  label: string;
  description: string;
  pricePerM2: number;
  metalness: number;
  roughness: number;
  envMapIntensity?: number;
  textureHint: string;
};

const MATERIALS: Record<MaterialType, MaterialDef> = {
  mdflam: {
    label: "MDF Lam",
    description: "Mat laminat kaplama",
    pricePerM2: 480,
    metalness: 0.0,
    roughness: 0.9,
    textureHint: "Tam mat"
  },
  lake: {
    label: "Lake",
    description: "Yarı parlak boya",
    pricePerM2: 720,
    metalness: 0.05,
    roughness: 0.45,
    textureHint: "Yarı parlak"
  },
  akrilik: {
    label: "Akrilik",
    description: "Yüksek parlaklık",
    pricePerM2: 980,
    metalness: 0.15,
    roughness: 0.05,
    envMapIntensity: 1.5,
    textureHint: "Ayna parlak"
  }
};

// Ortak renk paleti (MDF Lam, Lake, Akrilik aynı)
const SHARED_PALETTE = [
  { label: "Beyaz", hex: "#F5F0EB" },
  { label: "Bej", hex: "#D9C9B0" },
  { label: "Antrasit", hex: "#3D3D3D" },
  { label: "Ceviz", hex: "#6B3F2A" },
  { label: "Meşe", hex: "#A67C52" },
  { label: "Gri", hex: "#8E9BAD" }
];
const COLOR_PALETTES: Record<MaterialType, { label: string; hex: string }[]> = {
  mdflam: SHARED_PALETTE,
  lake: SHARED_PALETTE,
  akrilik: SHARED_PALETTE
};

// ─── Sabitler ─────────────────────────────────────────────────────────────────

const CM_TO_M = 0.01;
const SNAP_DISTANCE = 0.4;
const GRID_STEP_M = 0.05;

const VARIANT_BASE_COST: Record<CabinetVariant, number> = {
  drawerWardrobe: 3200,
  multiShelf: 1600,
  wardrobe: 2800,
  custom: 2000
};

const VARIANT_LABELS: Record<CabinetVariant, string> = {
  drawerWardrobe: "Çekmece ve Askılıklı",
  multiShelf: "Çok Raflı",
  wardrobe: "Askılıklı",
  custom: "Özel Tasarım"
};

// SVG ikonlar — çizime uygun
const VARIANT_SVG: Record<CabinetVariant, React.ReactNode> = {
  drawerWardrobe: (
    <svg width="28" height="34" viewBox="0 0 28 34" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="1" y="1" width="26" height="32" rx="2" stroke="currentColor" strokeWidth="1.5"/>
      <line x1="1" y1="15" x2="27" y2="15" stroke="currentColor" strokeWidth="1.5"/>
      <line x1="5" y1="8" x2="23" y2="8" stroke="currentColor" strokeWidth="1" strokeDasharray="2 1.5"/>
      <line x1="1" y1="22" x2="27" y2="22" stroke="currentColor" strokeWidth="1.2"/>
      <line x1="1" y1="28" x2="27" y2="28" stroke="currentColor" strokeWidth="1.2"/>
      <circle cx="14" cy="18.5" r="1.2" fill="currentColor"/>
      <circle cx="14" cy="25" r="1.2" fill="currentColor"/>
      <circle cx="14" cy="31" r="1.2" fill="currentColor"/>
    </svg>
  ),
  multiShelf: (
    <svg width="22" height="34" viewBox="0 0 22 34" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="1" y="1" width="20" height="32" rx="2" stroke="currentColor" strokeWidth="1.5"/>
      {[6,11,16,21,26].map((y: number) => (
        <line key={y} x1="1" y1={y} x2="21" y2={y} stroke="currentColor" strokeWidth="1.2"/>
      ))}
    </svg>
  ),
  wardrobe: (
    <svg width="30" height="34" viewBox="0 0 30 34" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="1" y="1" width="28" height="32" rx="2" stroke="currentColor" strokeWidth="1.5"/>
      <line x1="1" y1="9" x2="29" y2="9" stroke="currentColor" strokeWidth="1.5"/>
      <line x1="1" y1="24" x2="29" y2="24" stroke="currentColor" strokeWidth="1.5"/>
      <text x="15" y="7" textAnchor="middle" fontSize="5" fill="currentColor" fontFamily="sans-serif">RAF</text>
      <text x="15" y="22" textAnchor="middle" fontSize="5" fill="currentColor" fontFamily="sans-serif">RAF</text>
      <line x1="6" y1="16" x2="24" y2="16" stroke="currentColor" strokeWidth="1.2" strokeDasharray="2 1.5"/>
    </svg>
  ),
  custom: (
    <svg width="28" height="34" viewBox="0 0 28 34" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="1" y="1" width="26" height="32" rx="2" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 2"/>
      <line x1="10" y1="17" x2="18" y2="17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
      <line x1="14" y1="13" x2="14" y2="21" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
    </svg>
  )
};

// ─── Yardımcı Fonksiyonlar ────────────────────────────────────────────────────

function snapToGrid(v: number) {
  return Math.round(v / GRID_STEP_M) * GRID_STEP_M;
}

const PANEL_THICKNESS = 0.018;

function clampToRoom(x: number, z: number, room: RoomSize, cabW: number, cabD: number) {
  const halfRW = (room.width * CM_TO_M) / 2;
  const halfRD = (room.depth * CM_TO_M) / 2;
  const halfCW = cabW / 2;
  const halfCD = cabD / 2;
  const margin = PANEL_THICKNESS / 2;
  const cx = Math.max(-halfRW + halfCW + margin, Math.min(halfRW - halfCW - margin, x));
  const cz = Math.max(-halfRD + halfCD + margin, Math.min(halfRD - halfCD - margin, z));
  return { x: snapToGrid(cx), z: snapToGrid(cz) };
}

function snapToWalls(x: number, z: number, room: RoomSize, cabW: number, cabD: number) {
  const halfW = (room.width * CM_TO_M) / 2;
  const halfD = (room.depth * CM_TO_M) / 2;
  const halfCW = cabW / 2;
  const halfCD = cabD / 2;

  let snapX = x, snapZ = z;

  // Duvara yapış (mobilya kenarı duvarla temas)
  if (Math.abs(x + halfW - halfCW) < SNAP_DISTANCE) snapX = -halfW + halfCW;
  if (Math.abs(x - halfW + halfCW) < SNAP_DISTANCE) snapX =  halfW - halfCW;
  if (Math.abs(z + halfD - halfCD) < SNAP_DISTANCE) snapZ = -halfD + halfCD;
  if (Math.abs(z - halfD + halfCD) < SNAP_DISTANCE) snapZ =  halfD - halfCD;

  // Her zaman oda içinde kal
  return clampToRoom(snapX, snapZ, room, cabW, cabD);
}

function cabinetSurfaceM2(cab: Cabinet, roomHeight: number): number {
  const hCm = roomHeight * cab.heightRatio;
  const wCm = hCm * cab.widthFactor;
  const dCm = hCm * cab.depthFactor;
  const hM = hCm * CM_TO_M;
  const wM = wCm * CM_TO_M;
  const dM = dCm * CM_TO_M;
  return 2 * (wM * hM + wM * dM + hM * dM);
}

function cabinetCost(cab: Cabinet, roomHeight: number): number {
  const surface  = cabinetSurfaceM2(cab, roomHeight);
  const matPrice = MATERIALS[cab.material].pricePerM2 * surface;
  let cost = VARIANT_BASE_COST[cab.variant] + matPrice;
  if (cab.hasDoor) cost *= 1.15;
  return cost;
}

// ─── Renk yardımcısı ─────────────────────────────────────────────────────────

function shadeColor(hex: string, amount: number): string {
  const num = parseInt(hex.replace("#", ""), 16);
  const r = Math.max(0, Math.min(255, (num >> 16) + amount));
  const g = Math.max(0, Math.min(255, ((num >> 8) & 0xff) + amount));
  const b = Math.max(0, Math.min(255, (num & 0xff) + amount));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

// ─── CabinetMesh — Gerçekçi panel+detay render ───────────────────────────────

const MAT_OFFSET = { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 };

function CabinetMesh({
  cab, room, selected,
  onChangePosition, onChangeWidthFactor, onChangeHeightFactor, onSelect,
  onInteractionStart, onInteractionEnd,
  dragMeasure, onWidthDragValue, onHeightDragValue, onWidthDragEnd, onHeightDragEnd,
  editingShelf, onShelfDoubleClick, onShelfHeightSubmit
}: {
  cab: Cabinet; room: RoomSize; selected: boolean;
  onChangePosition: (id: number, x: number, z: number) => void;
  onChangeWidthFactor: (id: number, wf: number) => void;
  onChangeHeightFactor?: (id: number, hr: number) => void;
  onSelect: (id: number) => void;
  onInteractionStart: () => void;
  onInteractionEnd: () => void;
  dragMeasure: { value: string; type: "width" | "height" } | null;
  onWidthDragValue?: (v: string) => void;
  onHeightDragValue?: (v: string) => void;
  onWidthDragEnd?: () => void;
  onHeightDragEnd?: () => void;
  editingShelf: { cabId: number; sectionIndex: number } | null;
  onShelfDoubleClick?: (cabId: number, sectionIndex: number) => void;
  onShelfHeightSubmit?: (cabId: number, sectionIndex: number, heightCm: number) => void;
}) {
  const heightCm = room.height * cab.heightRatio;
  const widthCm  = heightCm * cab.widthFactor;
  const depthCm  = heightCm * cab.depthFactor;
  const W = widthCm * CM_TO_M;
  const H = heightCm * CM_TO_M;
  const D = depthCm * CM_TO_M;
  const T = PANEL_THICKNESS;
  const shelfSpacingM = cab.shelfSpacingCm * CM_TO_M;

  const mat = MATERIALS[cab.material];
  const color = cab.colorHex;
  const innerColor = shadeColor(color, -20);
  const matBase = { ...MAT_OFFSET, metalness: mat.metalness, roughness: mat.roughness, envMapIntensity: mat.envMapIntensity ?? 1 };

  const handleBodyPD = (e: any) => {
    e.stopPropagation(); onSelect(cab.id); onInteractionStart();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const handleBodyPM = (e: any) => {
    e.stopPropagation();
    if (!(e.target as HTMLElement).hasPointerCapture(e.pointerId)) return;
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const hit = new THREE.Vector3();
    e.ray.intersectPlane(plane, hit);
    const s = snapToWalls(hit.x, hit.z, room, W, D);
    onChangePosition(cab.id, s.x, s.z);
  };
  const handleBodyPU = (e: any) => {
    e.stopPropagation();
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    onInteractionEnd();
  };
  const bodyEvents = { onPointerDown: handleBodyPD, onPointerMove: handleBodyPM, onPointerUp: handleBodyPU };

  const handleWidthPD = (e: any) => {
    e.stopPropagation(); onSelect(cab.id); onInteractionStart();
    onWidthDragValue?.(Math.round(widthCm).toString());
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const handleWidthPM = (e: any) => {
    e.stopPropagation();
    if (!(e.target as HTMLElement).hasPointerCapture(e.pointerId)) return;
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const hit = new THREE.Vector3();
    e.ray.intersectPlane(plane, hit);
    const newWcm = Math.max(40, Math.min((Math.abs(hit.x - cab.x) / CM_TO_M) * 2, 400));
    onChangeWidthFactor(cab.id, newWcm / heightCm);
    onWidthDragValue?.(Math.round(newWcm).toString());
  };
  const handleWidthPU = (e: any) => {
    e.stopPropagation();
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    onWidthDragEnd?.();
    onInteractionEnd();
  };

  const handleHeightPD = (e: any) => {
    e.stopPropagation(); onSelect(cab.id); onInteractionStart();
    onHeightDragValue?.(Math.round(heightCm).toString());
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const handleHeightPM = (e: any) => {
    if (!onChangeHeightFactor) return;
    e.stopPropagation();
    if (!(e.target as HTMLElement).hasPointerCapture(e.pointerId)) return;
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -(cab.z + D / 2));
    const hit = new THREE.Vector3();
    e.ray.intersectPlane(plane, hit);
    const minH = 60 * CM_TO_M;
    const maxH = (room.height - 5) * CM_TO_M;
    const newHm = Math.max(minH, Math.min(maxH, hit.y));
    const newHr = newHm / (room.height * CM_TO_M);
    onChangeHeightFactor(cab.id, newHr);
    onHeightDragValue?.(Math.round(newHm / CM_TO_M).toString());
  };
  const handleHeightPU = (e: any) => {
    e.stopPropagation();
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    onHeightDragEnd?.();
    onInteractionEnd();
  };

  const widthDragEvents = { onPointerDown: handleWidthPD, onPointerMove: handleWidthPM, onPointerUp: handleWidthPU };
  const heightDragEvents = { onPointerDown: handleHeightPD, onPointerMove: handleHeightPM, onPointerUp: handleHeightPU };

  const matP = { ...matBase, color, emissive: selected ? "#ffffff" : "#000000", emissiveIntensity: selected ? 0.05 : 0 };
  const matInner = { ...matBase, color: innerColor, roughness: mat.roughness + 0.1 };
  const matMetal = { ...MAT_OFFSET, color: "#9CA3AF", metalness: 0.85, roughness: 0.15 };
  const matHandle = { ...MAT_OFFSET, color: "#6B7280", metalness: 0.75, roughness: 0.25 };

  const shelfHeights = cab.shelfHeightsCm && cab.shelfHeightsCm.length > 0
    ? cab.shelfHeightsCm
    : null;
  const shelfYs: number[] = [];
  if (cab.variant === "multiShelf") {
    if (shelfHeights && shelfHeights.length > 1) {
      let y = H / 2 - T;
      for (let i = 0; i < shelfHeights.length - 1; i++) {
        y -= shelfHeights[i] * CM_TO_M;
        shelfYs.push(y - H / 2);
      }
    } else if (shelfSpacingM > 0) {
      let y = T + shelfSpacingM;
      while (y < H - T - 0.01) { shelfYs.push(y - H / 2); y += shelfSpacingM; }
    }
  }
  if (cab.variant === "wardrobe" && shelfSpacingM > 0) {
    shelfYs.push(H / 2 - T - shelfSpacingM);
    shelfYs.push(-H / 2 + T + shelfSpacingM);
  }

  // drawerWardrobe: askı alanı SABİT 120 cm (üstten), altı çekmeceler
  const HANGER_HEIGHT_CM = 120;
  const hangerHeightM = HANGER_HEIGHT_CM * CM_TO_M;
  const dividerY = H / 2 - T - hangerHeightM; // group merkezine göre
  const drawerDivYs: number[] = [];
  if (cab.variant === "drawerWardrobe" && shelfSpacingM > 0) {
    let y = dividerY - shelfSpacingM;
    while (y > -H / 2 + T + 0.01) { drawerDivYs.push(y); y -= shelfSpacingM; }
  }

  const handleYs: number[] = [];
  if (cab.variant === "drawerWardrobe") {
    const segs = [dividerY, ...drawerDivYs, -H / 2 + T];
    for (let i = 0; i < segs.length - 1; i++) {
      handleYs.push((segs[i] + segs[i + 1]) / 2);
    }
  }

  // Askı çubuğu Y — askı alanının ortası
  const railY = cab.variant === "wardrobe" && shelfYs.length === 2
    ? (shelfYs[0] + shelfYs[1]) / 2
    : cab.variant === "drawerWardrobe"
    ? dividerY + hangerHeightM / 2
    : 0;

  // ── Bölüm ölçü etiketleri (3D Text yerine HTML overlay kullanılacak) ─────
  // Her bölüm için {y merkez, yükseklik cm} bilgisi
  type LabelInfo = { yCenter: number; heightCm: number; label: string };
  const dimensionLabels: LabelInfo[] = [];

  if (cab.variant === "multiShelf" && shelfYs.length > 0) {
    const boundaries = [H / 2 - T, ...shelfYs, -H / 2 + T].sort((a, b) => b - a);
    for (let i = 0; i < boundaries.length - 1; i++) {
      const top = boundaries[i], bot = boundaries[i + 1];
      const hCm = Math.round((top - bot) / CM_TO_M);
      dimensionLabels.push({ yCenter: (top + bot) / 2, heightCm: hCm, label: `${hCm} cm` });
    }
  }
  if (cab.variant === "drawerWardrobe") {
    // Askı bölümü
    dimensionLabels.push({ yCenter: dividerY + hangerHeightM / 2, heightCm: HANGER_HEIGHT_CM, label: `${HANGER_HEIGHT_CM} cm` });
    // Çekmece bölümleri
    const segs = [dividerY, ...drawerDivYs, -H / 2 + T].sort((a, b) => b - a);
    for (let i = 0; i < segs.length - 1; i++) {
      const top = segs[i], bot = segs[i + 1];
      const hCm = Math.round((top - bot) / CM_TO_M);
      dimensionLabels.push({ yCenter: (top + bot) / 2, heightCm: hCm, label: `${hCm} cm` });
    }
  }
  if (cab.variant === "wardrobe" && shelfYs.length === 2) {
    const topRafH = Math.round((H / 2 - T - shelfYs[0]) / CM_TO_M);
    const midH    = Math.round((shelfYs[0] - shelfYs[1]) / CM_TO_M);
    const botH    = Math.round((shelfYs[1] + H / 2 - T) / CM_TO_M);
    dimensionLabels.push({ yCenter: (H / 2 - T + shelfYs[0]) / 2, heightCm: topRafH, label: `${topRafH} cm` });
    dimensionLabels.push({ yCenter: (shelfYs[0] + shelfYs[1]) / 2, heightCm: midH,   label: `${midH} cm` });
    dimensionLabels.push({ yCenter: (shelfYs[1] - H / 2 + T) / 2, heightCm: botH,   label: `${botH} cm` });
  }

  return (
    <group position={[cab.x, H / 2, cab.z]} rotation={[0, cab.rotation, 0]}>

      {/* ── 5 Gövde Paneli ──────────────────────────────────────────────── */}
      {/* Taban */}
      <mesh castShadow receiveShadow position={[0, -H / 2 + T / 2, 0]} {...bodyEvents}>
        <boxGeometry args={[W, T, D]} />
        <meshStandardMaterial {...matP} {...MAT_OFFSET} />
      </mesh>
      {/* Tavan — yükseklik sürükle */}
      <mesh castShadow receiveShadow position={[0, H / 2 - T / 2, 0]} {...heightDragEvents}>
        <boxGeometry args={[W, T, D]} />
        <meshStandardMaterial {...matP} {...MAT_OFFSET} />
      </mesh>

      {/* ── Yükseklik sürükleme ikonu (üst kenar ortası) ── */}
      {selected && (
        <Html position={[0, H / 2 + 0.06, D / 2]} center distanceFactor={3} style={{ pointerEvents: "none" }}>
          <div style={{
            background: "rgba(37,99,235,0.92)",
            borderRadius: "6px",
            padding: "3px 5px",
            display: "flex",
            alignItems: "center",
            gap: "2px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.18)",
            userSelect: "none",
          }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
              <path d="M12 5v14M8 9l4-4 4 4M8 15l4 4 4-4"/>
            </svg>
          </div>
        </Html>
      )}
      {/* Sol yan */}
      <mesh castShadow receiveShadow position={[-W / 2 + T / 2, 0, 0]} {...bodyEvents}>
        <boxGeometry args={[T, H - T * 2, D]} />
        <meshStandardMaterial {...matP} {...MAT_OFFSET} />
      </mesh>
      {/* Sağ yan — genişlik sürükle */}
      <mesh castShadow receiveShadow position={[W / 2 - T / 2, 0, 0]} {...widthDragEvents}>
        <boxGeometry args={[T, H - T * 2, D]} />
        <meshStandardMaterial {...matP} {...MAT_OFFSET} />
      </mesh>

      {/* ── Genişlik sürükleme ikonu (sağ kenar ortası) ── */}
      {selected && (
        <Html position={[W / 2 + 0.04, 0, D / 2]} center distanceFactor={3} style={{ pointerEvents: "none" }}>
          <div style={{
            background: "rgba(37,99,235,0.92)",
            borderRadius: "6px",
            padding: "3px 5px",
            display: "flex",
            alignItems: "center",
            gap: "2px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.18)",
            userSelect: "none",
          }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
              <path d="M5 12h14M15 8l4 4-4 4M9 8l-4 4 4 4"/>
            </svg>
          </div>
        </Html>
      )}

      {/* Arka panel */}
      <mesh castShadow position={[0, 0, -D / 2 + T * 0.4]} {...bodyEvents}>
        <boxGeometry args={[W - T * 2, H - T * 2, T * 0.5]} />
        <meshStandardMaterial {...matInner} {...MAT_OFFSET} />
      </mesh>

      {/* ── Kapak (hasDoor) ────────────────────────────────────────────────── */}
      {cab.hasDoor && (
        <mesh castShadow position={[0, 0, D / 2 + T / 2]}>
          <boxGeometry args={[W - T * 2, H - T * 2, T]} />
          <meshStandardMaterial {...matP} {...MAT_OFFSET} />
        </mesh>
      )}

      {/* ── Raflar (çift tıkla bölüm yüksekliğini düzenle) ─────────────────── */}
      {cab.variant === "multiShelf" && shelfYs.map((yPos, i) => {
        const isEditing = editingShelf?.cabId === cab.id && editingShelf?.sectionIndex === i;
        const sectionHeightCm = shelfHeights?.[i] ?? cab.shelfSpacingCm;
        return (
          <group key={`s${i}`} position={[0, yPos, 0]}>
            <mesh
              castShadow
              onDoubleClick={(e) => { e.stopPropagation(); onShelfDoubleClick?.(cab.id, i); }}
            >
              <boxGeometry args={[W - T * 2, T, D - T * 1.5]} />
              <meshStandardMaterial {...MAT_OFFSET} color={color} metalness={mat.metalness} roughness={mat.roughness} />
            </mesh>
            {isEditing && (
              <Html position={[0, 0.08, 0]} center distanceFactor={3} style={{ pointerEvents: "auto" }}>
                <input
                  type="number"
                  min={10}
                  max={250}
                  defaultValue={sectionHeightCm}
                  className="w-14 rounded px-1.5 py-0.5 text-xs font-semibold bg-white border border-slate-300 shadow-lg text-slate-800"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const v = parseInt((e.target as HTMLInputElement).value, 10);
                      if (!Number.isNaN(v)) onShelfHeightSubmit?.(cab.id, i, v);
                    }
                  }}
                  onBlur={(e) => {
                    const v = parseInt((e.target as HTMLInputElement).value, 10);
                    if (!Number.isNaN(v)) onShelfHeightSubmit?.(cab.id, i, v);
                  }}
                  autoFocus
                />
              </Html>
            )}
          </group>
        );
      })}
      {cab.variant !== "multiShelf" && shelfYs.map((yPos, i) => (
        <mesh key={`s${i}`} castShadow position={[0, yPos, 0]}>
          <boxGeometry args={[W - T * 2, T, D - T * 1.5]} />
          <meshStandardMaterial {...MAT_OFFSET} color={color} metalness={mat.metalness} roughness={mat.roughness} />
        </mesh>
      ))}

      {/* ── drawerWardrobe: orta bölme ──────────────────────────────────── */}
      {cab.variant === "drawerWardrobe" && (
        <mesh castShadow position={[0, dividerY, 0]}>
          <boxGeometry args={[W - T * 2, T, D - T * 1.5]} />
          <meshStandardMaterial {...MAT_OFFSET} color={color} metalness={mat.metalness} roughness={mat.roughness} />
        </mesh>
      )}

      {/* ── Çekmece ara bölmeleri (ince çizgi) ──────────────────────────── */}
      {drawerDivYs.map((yPos, i) => (
        <mesh key={`dd${i}`} position={[0, yPos, D / 2 - T * 0.6]}>
          <boxGeometry args={[W - T * 2.5, T * 0.4, T * 0.25]} />
          <meshStandardMaterial color={shadeColor(color, -30)} roughness={0.9} />
        </mesh>
      ))}

      {/* ── Çekmece tutamaçları (kapaksız: önde; kapaklı: kapak üzerinde) ─── */}
      {handleYs.map((yPos, i) => (
        <group key={`h${i}`} position={[0, yPos, cab.hasDoor ? D / 2 + T + 0.003 : D / 2 + 0.003]}>
          <mesh>
            <boxGeometry args={[W * 0.3, 0.013, 0.013]} />
            <meshStandardMaterial {...matHandle} />
          </mesh>
          <mesh position={[-W * 0.14, -0.02, -0.005]}>
            <boxGeometry args={[0.009, 0.024, 0.009]} />
            <meshStandardMaterial {...matHandle} />
          </mesh>
          <mesh position={[W * 0.14, -0.02, -0.005]}>
            <boxGeometry args={[0.009, 0.024, 0.009]} />
            <meshStandardMaterial {...matHandle} />
          </mesh>
        </group>
      ))}

      {/* ── Askı çubuğu ─────────────────────────────────────────────────── */}
      {(cab.variant === "wardrobe" || cab.variant === "drawerWardrobe") && (
        <group position={[0, railY, -D * 0.15]}>
          <mesh rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.009, 0.009, W - T * 2.5, 16]} />
            <meshStandardMaterial {...matMetal} />
          </mesh>
          <mesh position={[-(W - T * 2.5) / 2, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.014, 0.014, 0.014, 12]} />
            <meshStandardMaterial {...matHandle} />
          </mesh>
          <mesh position={[(W - T * 2.5) / 2, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.014, 0.014, 0.014, 12]} />
            <meshStandardMaterial {...matHandle} />
          </mesh>
        </group>
      )}

      {/* ── Özel modül bölümleri ─────────────────────────────────────────── */}
      {cab.variant === "custom" && cab.customSections && (() => {
        const sections = cab.customSections!;
        const totalCm = sections.reduce((s, sec) => s + sec.heightCm, 0);
        if (totalCm === 0) return null;
        const scale = (H - T * 2) / (totalCm * CM_TO_M);
        const elements: React.ReactNode[] = [];
        let curY = H / 2 - T; // top, counting down

        sections.forEach((sec, i) => {
          const secH = sec.heightCm * CM_TO_M * scale;
          const secCenterY = curY - secH / 2;
          const botY = curY - secH;

          // Bölme çizgisi (alta)
          if (i < sections.length - 1) {
            elements.push(
              <mesh key={`cdiv${i}`} castShadow position={[0, botY, 0]}>
                <boxGeometry args={[W - T * 2, T, D - T * 1.5]} />
                <meshStandardMaterial color={color} metalness={mat.metalness} roughness={mat.roughness} />
              </mesh>
            );
          }

          // Bölüm içeriği
          if (sec.type === "drawer") {
            // Çekmece tutamaçları
            elements.push(
              <group key={`csec${i}`} position={[0, secCenterY, D / 2 + 0.003]}>
                <mesh>
                  <boxGeometry args={[W * 0.3, 0.013, 0.013]} />
                  <meshStandardMaterial color="#6B7280" metalness={0.75} roughness={0.25} />
                </mesh>
                <mesh position={[-W * 0.14, -0.02, -0.005]}>
                  <boxGeometry args={[0.009, 0.024, 0.009]} />
                  <meshStandardMaterial color="#6B7280" metalness={0.75} roughness={0.25} />
                </mesh>
                <mesh position={[W * 0.14, -0.02, -0.005]}>
                  <boxGeometry args={[0.009, 0.024, 0.009]} />
                  <meshStandardMaterial color="#6B7280" metalness={0.75} roughness={0.25} />
                </mesh>
              </group>
            );
          } else if (sec.type === "hanger") {
            elements.push(
              <group key={`csec${i}`} position={[0, secCenterY, -D * 0.15]}>
                <mesh rotation={[0, 0, Math.PI / 2]}>
                  <cylinderGeometry args={[0.009, 0.009, W - T * 2.5, 16]} />
                  <meshStandardMaterial color="#9CA3AF" metalness={0.85} roughness={0.15} />
                </mesh>
                <mesh position={[-(W - T * 2.5) / 2, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
                  <cylinderGeometry args={[0.014, 0.014, 0.014, 12]} />
                  <meshStandardMaterial color="#6B7280" metalness={0.7} roughness={0.3} />
                </mesh>
                <mesh position={[(W - T * 2.5) / 2, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
                  <cylinderGeometry args={[0.014, 0.014, 0.014, 12]} />
                  <meshStandardMaterial color="#6B7280" metalness={0.7} roughness={0.3} />
                </mesh>
              </group>
            );
          }
          // shelf & open: sadece bölme çizgisi yeterli

          // Boyut etiketi
          elements.push(
            <Html key={`clbl${i}`} position={[W / 2 + 0.02, secCenterY, 0]} center distanceFactor={4} style={{ pointerEvents: "none" }}>
              <div style={{ fontSize: "9px", color: "rgba(0,0,0,0.3)", whiteSpace: "nowrap", fontFamily: "system-ui, sans-serif", userSelect: "none" }}>
                {sec.heightCm} cm
              </div>
            </Html>
          );

          curY = botY;
        });
        return elements;
      })()}
      {selected && (
        <lineSegments>
          <edgesGeometry args={[new THREE.BoxGeometry(W + 0.008, H + 0.008, D + 0.008)]} />
          <lineBasicMaterial color="#F59E0B" />
        </lineSegments>
      )}

      {/* ── Bölüm ölçü etiketleri ────────────────────────────────────────── */}
      {dimensionLabels.map((lbl, i) => (
        <Html
          key={`lbl${i}`}
          position={[W / 2 + 0.02, lbl.yCenter, 0]}
          center
          distanceFactor={4}
          style={{ pointerEvents: "none" }}
        >
          <div style={{
            fontSize: "9px",
            color: "rgba(0,0,0,0.3)",
            background: "transparent",
            whiteSpace: "nowrap",
            fontFamily: "system-ui, sans-serif",
            letterSpacing: "0.02em",
            userSelect: "none",
          }}>
            {lbl.label}
          </div>
        </Html>
      ))}

      {/* ── Sürükleme tooltip (genişlik/yükseklik cm) ─────────────────────── */}
      {dragMeasure && (
        <Html position={[0, dragMeasure.type === "height" ? H / 2 - T : 0, D / 2 + 0.05]} center distanceFactor={3} style={{ pointerEvents: "none" }}>
          <div className="rounded px-2 py-1 text-xs font-semibold bg-white text-slate-800 shadow-md whitespace-nowrap">
            {dragMeasure.value} cm
          </div>
        </Html>
      )}
    </group>
  );
}

// ─── Varsayılan dolap oluşturucu ──────────────────────────────────────────────

function createCabinet(id: number, variant: CabinetVariant, customSections?: CustomSection[]): Cabinet {
  const base = {
    id, x: 0, z: 0, variant, rotation: 0,
    material: "mdflam" as MaterialType,
    colorHex: COLOR_PALETTES.mdflam[0].hex,
    shelfSpacingCm: 35,
    hasDoor: false,
    lockedTo: null as number | null
  };
  if (variant === "drawerWardrobe") return { ...base, heightRatio: 0.82, widthFactor: 0.23, depthFactor: 0.22 };
  if (variant === "multiShelf")     return { ...base, heightRatio: 0.90, widthFactor: 0.12, depthFactor: 0.20 };
  if (variant === "custom")         return { ...base, heightRatio: 0.90, widthFactor: 0.23, depthFactor: 0.22, customSections: customSections ?? [] };
  return                                   { ...base, heightRatio: 0.90, widthFactor: 0.23, depthFactor: 0.22 };
}

// ─── Ana Sayfa ────────────────────────────────────────────────────────────────

export default function Page() {
  const [room, setRoom]         = useState<RoomSize>({ width: 400, depth: 400, height: 260 });
  const [cabinets, setCabinets] = useState<Cabinet[]>([{ ...createCabinet(1, "drawerWardrobe"), x: -1 }]);
  const [selectedId, setSelectedId] = useState<number | null>(1);
  const exportGroupRef = useRef<THREE.Group | null>(null);
  const [glbUrl, setGlbUrl]       = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [orbitInteracting, setOrbitInteracting] = useState(false);
  const [savedLayouts, setSavedLayouts] = useState<SavedLayout[]>([]);
  const [saveLayoutName, setSaveLayoutName] = useState("");
  const [showVideoMeasure, setShowVideoMeasure] = useState(false);
  const videoMeasureRef = useRef<HTMLVideoElement | null>(null);
  const videoStreamRef = useRef<MediaStream | null>(null);
  const [editingShelf, setEditingShelf] = useState<{ cabId: number; sectionIndex: number } | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as SavedLayout[];
        setSavedLayouts(Array.isArray(parsed) ? parsed : []);
      }
    } catch {
      setSavedLayouts([]);
    }
  }, []);

  const persistSavedLayouts = (list: SavedLayout[]) => {
    setSavedLayouts(list);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch {}
  };

  const saveCurrentLayout = () => {
    const name = saveLayoutName.trim() || `Kombin ${new Date().toLocaleDateString("tr-TR")}`;
    const layout: SavedLayout = {
      name,
      cabinets: cabinets.map(c => ({ ...c })),
      room: { ...room },
      savedAt: Date.now()
    };
    persistSavedLayouts([...savedLayouts, layout]);
    setSaveLayoutName("");
  };

  const loadLayout = (layout: SavedLayout) => {
    setRoom(layout.room);
    setCabinets(layout.cabinets.map(c => ({
      ...c,
      hasDoor: c.hasDoor ?? false,
      lockedTo: c.lockedTo ?? null
    })));
    setSelectedId(layout.cabinets[0]?.id ?? null);
  };

  const deleteSavedLayout = (savedAt: number) => {
    persistSavedLayouts(savedLayouts.filter(l => l.savedAt !== savedAt));
  };

  const downloadPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text("ModuPlan", 14, 20);
    doc.setFontSize(10);
    doc.text(new Date().toLocaleDateString("tr-TR"), 14, 28);
    doc.setFontSize(11);
    doc.text(`Oda: ${room.width} x ${room.depth} x ${room.height} cm  |  ${roomM2.toFixed(1)} m2`, 14, 36);
    const tableData = cabinets.map(c => [
      VARIANT_LABELS[c.variant],
      MATERIALS[c.material].label,
      c.colorHex,
      `${Math.round(room.height * c.heightRatio * c.widthFactor)}`,
      `${Math.round(room.height * c.heightRatio)}`,
      cabinetCost(c, room.height).toLocaleString("tr-TR")
    ]);
    autoTable(doc, {
      startY: 42,
      head: [["Tur", "Kaplama", "Renk", "Genislik (cm)", "Yukseklik (cm)", "Birim Maliyet (TL)"]],
      body: tableData,
      theme: "grid"
    });
    const finalY = (doc as any).lastAutoTable?.finalY ?? 42;
    const subtotal = totalCost;
    const kdv = subtotal * 0.1;
    doc.setFontSize(10);
    doc.text(`Ara Toplam: ${subtotal.toLocaleString("tr-TR")} TL`, 14, finalY + 10);
    doc.text(`KDV (%10): ${kdv.toLocaleString("tr-TR")} TL`, 14, finalY + 16);
    doc.text(`Genel Toplam: ${(subtotal + kdv).toLocaleString("tr-TR")} TL`, 14, finalY + 22);
    doc.setFontSize(8);
    doc.text("Bu fiyatlar tahminidir, KDV harictir.", 14, doc.internal.pageSize.height - 10);
    doc.save("moduplan-teklif.pdf");
  };

  const startVideoMeasure = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      videoStreamRef.current = stream;
      setShowVideoMeasure(true);
      setTimeout(() => {
        if (videoMeasureRef.current) videoMeasureRef.current.srcObject = stream;
      }, 100);
    } catch {
      alert("Kamera erişimi yok. Tarayıcı izni verin veya cihazınızda kamera olduğundan emin olun.");
    }
  };

  const stopVideoMeasure = () => {
    videoStreamRef.current?.getTracks().forEach(t => t.stop());
    videoStreamRef.current = null;
    setShowVideoMeasure(false);
  };

  const applyVideoMeasure = (w: number, d: number, h: number) => {
    setRoom(prev => ({ ...prev, width: w, depth: d, height: h }));
    stopVideoMeasure();
  };

  // ── Özel modül tasarımcısı state ────────────────────────────────────────
  const [showCustomBuilder, setShowCustomBuilder] = useState(false);
  const [customSections, setCustomSections] = useState<CustomSection[]>([
    { id: 1, type: "hanger", heightCm: 120 },
    { id: 2, type: "shelf",  heightCm: 40 },
  ]);
  const nextSecId = React.useRef(10);

  // ── Dolap yönetimi ───────────────────────────────────────────────────────

  const addCabinet = (variant: CabinetVariant) => {
    const id = cabinets.length ? Math.max(...cabinets.map(c => c.id)) + 1 : 1;
    const sections = variant === "custom" ? customSections.map(s => ({ ...s })) : undefined;
    setCabinets(prev => [...prev, createCabinet(id, variant, sections)]);
    setSelectedId(id);
  };

  const deleteSelected = () => {
    if (selectedId == null) return;
    setCabinets(prev => {
      const next = prev.filter(c => c.id !== selectedId);
      return next.map(c => (c.lockedTo === selectedId ? { ...c, lockedTo: null } : c));
    });
    setSelectedId(null);
  };

  const updateCabinetPosition = (id: number, x: number, z: number) => {
    setCabinets(prev => {
      const cab = prev.find(c => c.id === id);
      if (!cab) return prev;
      const dx = x - cab.x;
      const dz = z - cab.z;
      return prev.map(c => {
        if (c.id === id) return { ...c, x, z };
        if (c.lockedTo === id) return { ...c, x: c.x + dx, z: c.z + dz };
        if (cab.lockedTo === c.id) return { ...c, x: c.x + dx, z: c.z + dz };
        return c;
      });
    });
  };

  const updateCabinetWidthFactor = (id: number, widthFactor: number) =>
    setCabinets(prev => prev.map(c => c.id === id ? { ...c, widthFactor } : c));

  const updateCabinetHeightFactor = (id: number, heightRatio: number) =>
    setCabinets(prev => prev.map(c => c.id === id ? { ...c, heightRatio } : c));

  const [dragMeasure, setDragMeasure] = useState<{ cabId: number; value: string; type: "width" | "height" } | null>(null);
  const dragMeasureTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleDragMeasureHide = () => {
    if (dragMeasureTimeoutRef.current) clearTimeout(dragMeasureTimeoutRef.current);
    dragMeasureTimeoutRef.current = setTimeout(() => {
      setDragMeasure(null);
      dragMeasureTimeoutRef.current = null;
    }, 1500);
  };
  const handleWidthDragValue = (cabId: number, value: string) =>
    setDragMeasure({ cabId, value, type: "width" });
  const handleHeightDragValue = (cabId: number, value: string) =>
    setDragMeasure({ cabId, value, type: "height" });
  const handleWidthDragEnd = () => scheduleDragMeasureHide();
  const handleHeightDragEnd = () => scheduleDragMeasureHide();

  const rotateSelectedCabinet = () => {
    if (selectedId == null) return;
    setCabinets(prev => prev.map(c =>
      c.id === selectedId
        ? { ...c, rotation: (c.rotation + Math.PI / 2) % (Math.PI * 2) }
        : c
    ));
  };

  const updateSelectedMaterial = (material: MaterialType) => {
    if (selectedId == null) return;
    const firstColor = COLOR_PALETTES[material][0].hex;
    setCabinets(prev => prev.map(c =>
      c.id === selectedId ? { ...c, material, colorHex: firstColor } : c
    ));
  };

  const updateSelectedColor = (colorHex: string) => {
    if (selectedId == null) return;
    setCabinets(prev => prev.map(c => c.id === selectedId ? { ...c, colorHex } : c));
  };

  const updateSelectedShelfSpacing = (val: string) => {
    if (selectedId == null) return;
    const num = parseFloat(val);
    if (!Number.isNaN(num) && num > 5) {
      setCabinets(prev => prev.map(c =>
        c.id === selectedId ? { ...c, shelfSpacingCm: num } : c
      ));
    }
  };

  const updateSelectedWidthCm = (val: string) => {
    if (selectedId == null || !selectedCab) return;
    const num = parseInt(val, 10);
    if (Number.isNaN(num) || num < 40 || num > 400) return;
    const heightCm = room.height * selectedCab.heightRatio;
    setCabinets(prev => prev.map(c =>
      c.id === selectedId ? { ...c, widthFactor: num / heightCm } : c
    ));
  };
  const updateSelectedHeightCm = (val: string) => {
    if (selectedId == null) return;
    const num = parseInt(val, 10);
    if (Number.isNaN(num) || num < 60 || num > room.height - 5) return;
    setCabinets(prev => prev.map(c =>
      c.id === selectedId ? { ...c, heightRatio: num / room.height } : c
    ));
  };
  const toggleSelectedHasDoor = () => {
    if (selectedId == null) return;
    setCabinets(prev => prev.map(c =>
      c.id === selectedId ? { ...c, hasDoor: !c.hasDoor } : c
    ));
  };
  const updateCabinetShelfHeight = (cabId: number, sectionIndex: number, heightCm: number) => {
    setCabinets(prev => prev.map(c => {
      if (c.id !== cabId || c.variant !== "multiShelf") return c;
      const cab = c;
      let heights = cab.shelfHeightsCm;
      if (!heights || heights.length === 0) {
        const H = room.height * cab.heightRatio * CM_TO_M;
        const T = PANEL_THICKNESS;
        const n = Math.max(2, Math.floor((H - 2 * T) / (cab.shelfSpacingCm * CM_TO_M)));
        heights = Array(n).fill(Math.round((H - 2 * T) / CM_TO_M / n));
      }
      const next = [...heights];
      if (sectionIndex >= 0 && sectionIndex < next.length) {
        next[sectionIndex] = Math.max(10, Math.min(250, heightCm));
      }
      return { ...c, shelfHeightsCm: next };
    }));
    setEditingShelf(null);
  };

  const lockSelectedToNeighbor = () => {
    if (selectedId == null || !selectedCab) return;
    const others = cabinets.filter(c => c.id !== selectedId);
    if (others.length === 0) return;
    const halfW = (selectedCab.widthFactor * room.height * selectedCab.heightRatio * CM_TO_M) / 2;
    const halfD = (selectedCab.depthFactor * room.height * selectedCab.heightRatio * CM_TO_M) / 2;
    let nearest: { id: number; dist: number } | null = null;
    for (const o of others) {
      const ow = (o.widthFactor * room.height * o.heightRatio * CM_TO_M) / 2;
      const od = (o.depthFactor * room.height * o.heightRatio * CM_TO_M) / 2;
      const dist = Math.hypot(selectedCab.x - o.x, selectedCab.z - o.z);
      if (dist < (nearest?.dist ?? Infinity)) nearest = { id: o.id, dist };
    }
    if (!nearest) return;
    const other = cabinets.find(c => c.id === nearest!.id)!;
    let dx = other.x - selectedCab.x;
    let dz = other.z - selectedCab.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.01) return;
    dx /= dist;
    dz /= dist;
    const ow = (other.widthFactor * room.height * other.heightRatio * CM_TO_M) / 2;
    const od = (other.depthFactor * room.height * other.heightRatio * CM_TO_M) / 2;
    let snapX = other.x - dx * (halfW + ow);
    let snapZ = other.z - dz * (halfD + od);
    snapX = snapToGrid(snapX);
    snapZ = snapToGrid(snapZ);
    setCabinets(prev => prev.map(c => {
      if (c.id === selectedId) return { ...c, x: snapX, z: snapZ, lockedTo: nearest!.id };
      if (c.id === nearest!.id) return { ...c, lockedTo: selectedId };
      return c;
    }));
  };

  const handleRoomChange = (field: keyof RoomSize, value: string) => {
    const num = parseInt(value || "0", 10);
    if (!Number.isNaN(num)) setRoom(prev => ({ ...prev, [field]: num }));
  };

  const handleExportAR = async () => {
    if (!exportGroupRef.current) return;
    try {
      setExporting(true);
      if (glbUrl) URL.revokeObjectURL(glbUrl);
      const blob = await exportObjectToGLB(exportGroupRef.current);
      setGlbUrl(URL.createObjectURL(blob));
    } finally {
      setExporting(false);
    }
  };

  // ── Hesaplamalar ─────────────────────────────────────────────────────────

  const roomWidthM  = room.width  * CM_TO_M;
  const roomDepthM  = room.depth  * CM_TO_M;
  const roomHeightM = room.height * CM_TO_M;
  const roomM2      = (room.width * room.depth) / 10000;
  const totalCost   = cabinets.reduce((sum, c) => sum + cabinetCost(c, room.height), 0);
  const selectedCab = cabinets.find(c => c.id === selectedId) ?? null;

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen flex flex-col bg-appbg">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-8 py-4 border-b border-slate-200 bg-white/80 backdrop-blur">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-2xl bg-primary/10 flex items-center justify-center">
            <span className="text-primary font-bold text-sm">M</span>
          </div>
          <div>
            <div className="font-semibold tracking-tight text-slate-900">ModuPlan</div>
            <div className="text-xs text-slate-500">Kod bilmeden 3D mobilya tasarla &amp; AR&apos;da gör</div>
          </div>
        </div>
        <button
          onClick={handleExportAR}
          disabled={exporting}
          className="px-4 py-2 rounded-2xl bg-primary text-white text-xs font-semibold shadow-sm hover:bg-blue-600 disabled:opacity-60 disabled:cursor-not-allowed transition"
        >
          {exporting ? "Hazırlanıyor..." : "Odamda Gör (AR)"}
        </button>
      </header>

      <main className="flex-1 flex gap-4 px-6 py-6">

        {/* ── 3D Sahne ──────────────────────────────────────────────────── */}
        <section className="flex-1 relative">
          <div className="w-full h-full rounded-2xl shadow-xl overflow-hidden" style={{ background: "#F8F9FA" }}>
            <Canvas shadows camera={{ position: [4, 4, 4], fov: 45 }}>
              <color attach="background" args={["#F8F9FA"]} />
              <ambientLight intensity={0.65} />
              <directionalLight position={[5, 8, 5]} intensity={0.5} castShadow />

              {/* Zemin */}
              <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow position={[0, 0, 0]}>
                <planeGeometry args={[roomWidthM, roomDepthM]} />
                <meshStandardMaterial color="#EDEDEF" />
              </mesh>

              <Grid
                args={[roomWidthM, roomDepthM]}
                cellSize={0.5} cellThickness={0.25} cellColor="#D1D5DB"
                sectionSize={1} sectionThickness={0.8} sectionColor="#9CA3AF"
                position={[0, 0.001, 0]}
              />

              {/* Duvarlar */}
              <mesh position={[0, roomHeightM / 2, -roomDepthM / 2]}>
                <boxGeometry args={[roomWidthM, roomHeightM, 0.05]} />
                <meshStandardMaterial color="#E5E7EB" />
              </mesh>
              <mesh position={[-roomWidthM / 2, roomHeightM / 2, 0]}>
                <boxGeometry args={[0.05, roomHeightM, roomDepthM]} />
                <meshStandardMaterial color="#E5E7EB" />
              </mesh>
              <mesh position={[roomWidthM / 2, roomHeightM / 2, 0]}>
                <boxGeometry args={[0.05, roomHeightM, roomDepthM]} />
                <meshStandardMaterial color="#E5E7EB" />
              </mesh>

              {/* Dolaplar */}
              <group ref={exportGroupRef}>
                {cabinets.map(cab => (
                  <CabinetMesh
                    key={cab.id}
                    cab={cab}
                    room={room}
                    selected={cab.id === selectedId}
                    onChangePosition={updateCabinetPosition}
                    onChangeWidthFactor={updateCabinetWidthFactor}
                    onChangeHeightFactor={updateCabinetHeightFactor}
                    onSelect={setSelectedId}
                    onInteractionStart={() => setOrbitInteracting(true)}
                    onInteractionEnd={() => setOrbitInteracting(false)}
                    dragMeasure={dragMeasure?.cabId === cab.id ? { value: dragMeasure.value, type: dragMeasure.type } : null}
                    onWidthDragValue={v => handleWidthDragValue(cab.id, v)}
                    onHeightDragValue={v => handleHeightDragValue(cab.id, v)}
                    onWidthDragEnd={handleWidthDragEnd}
                    onHeightDragEnd={handleHeightDragEnd}
                    editingShelf={editingShelf}
                    onShelfDoubleClick={(cid, idx) => setEditingShelf({ cabId: cid, sectionIndex: idx })}
                    onShelfHeightSubmit={updateCabinetShelfHeight}
                  />
                ))}
              </group>

              <OrbitControls
                makeDefault enablePan enableZoom
                enableRotate={!orbitInteracting}
                maxPolarAngle={Math.PI / 2.1}
              />
            </Canvas>

            {/* ── Seçili mobilya üstü butonlar ── */}
            {selectedCab && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 pointer-events-none">
                <div className="flex items-center gap-2 bg-slate-900/80 backdrop-blur-md border border-slate-700 rounded-2xl px-3 py-2 shadow-xl pointer-events-auto">
                  {/* Mobilya adı */}
                  <div className="flex items-center gap-1.5 pr-2 border-r border-slate-700">
                    <span
                      className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                      style={{ background: selectedCab.colorHex, border: "1px solid rgba(255,255,255,0.2)" }}
                    />
                    <span className="text-xs text-slate-300 font-medium whitespace-nowrap">
                      {VARIANT_LABELS[selectedCab.variant]}
                    </span>
                  </div>

                  {/* Döndür */}
                  <button
                    onClick={rotateSelectedCabinet}
                    title="90° Döndür"
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold transition"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                      <path d="M3 3v5h5"/>
                    </svg>
                    90°
                  </button>

                  {/* Sil */}
                  <button
                    onClick={deleteSelected}
                    title="Sil"
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-red-500/20 hover:bg-red-500/40 text-red-400 hover:text-red-300 text-xs font-semibold transition border border-red-500/30"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6"/>
                      <path d="M19 6l-1 14H6L5 6"/>
                      <path d="M10 11v6M14 11v6"/>
                      <path d="M9 6V4h6v2"/>
                    </svg>
                    Sil
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* ── Sağ Panel ─────────────────────────────────────────────────── */}
        <aside className="w-80 space-y-4 overflow-y-auto max-h-[calc(100vh-120px)]">

          {/* PDF İndir */}
          <button
            type="button"
            onClick={downloadPDF}
            className="w-full py-2.5 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 flex items-center justify-center gap-2"
          >
            PDF İndir
          </button>

          {/* Oda Ölçüleri */}
          <div className="bg-white/80 backdrop-blur rounded-2xl shadow-sm border border-slate-200 p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-semibold text-slate-500">Oda Ölçüleri</div>
              <div className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-lg">
                {roomM2.toFixed(1)} m²
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs">
              {(["width", "depth", "height"] as (keyof RoomSize)[]).map((field, i) => (
                <label key={field} className="flex flex-col gap-1">
                  <span className="text-slate-500">{["Genişlik", "Derinlik", "Yükseklik"][i]} (cm)</span>
                  <input
                    type="number"
                    value={room[field]}
                    onChange={e => handleRoomChange(field, e.target.value)}
                    className="rounded-xl border border-slate-200 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                </label>
              ))}
            </div>
            <button
              type="button"
              onClick={startVideoMeasure}
              className="mt-3 w-full py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-medium text-slate-700"
            >
              Videodan Ölç
            </button>
          </div>

          {/* Modül Ekle */}
          <div className="bg-white/80 backdrop-blur rounded-2xl shadow-sm border border-slate-200 p-4 space-y-2">
            <div className="text-xs font-semibold text-slate-500 mb-1">Modül Ekle</div>

            {/* Hazır modüller */}
            {(["drawerWardrobe", "multiShelf", "wardrobe"] as CabinetVariant[]).map(v => (
              <button
                key={v}
                onClick={() => addCabinet(v)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-slate-200 hover:bg-primary/5 hover:border-primary/30 text-xs transition group"
              >
                <span className="text-slate-500 group-hover:text-primary transition flex-shrink-0">
                  {VARIANT_SVG[v]}
                </span>
                <span className="font-medium text-slate-700">{VARIANT_LABELS[v]}</span>
                <span className="ml-auto text-[10px] text-slate-400">+ Ekle</span>
              </button>
            ))}

            {/* Özel Modül Tasarla */}
            <div className="pt-1 border-t border-slate-100">
              <button
                onClick={() => setShowCustomBuilder(v => !v)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-xs transition group ${
                  showCustomBuilder
                    ? "border-primary/40 bg-primary/5 text-primary"
                    : "border-dashed border-slate-300 hover:border-primary/40 hover:bg-primary/5 text-slate-500 hover:text-primary"
                }`}
              >
                <span className="flex-shrink-0">{VARIANT_SVG.custom}</span>
                <span className="font-medium">Özel Modül Tasarla</span>
                <span className="ml-auto text-[10px] opacity-60">{showCustomBuilder ? "▲" : "▼"}</span>
              </button>

              {showCustomBuilder && (
                <div className="mt-3 space-y-2">
                  {/* Toplam yükseklik göstergesi */}
                  <div className="flex items-center justify-between text-[10px] text-slate-400 px-1">
                    <span>Toplam</span>
                    <span className={`font-semibold ${
                      customSections.reduce((s, sec) => s + sec.heightCm, 0) > 260
                        ? "text-red-500" : "text-slate-600"
                    }`}>
                      {customSections.reduce((s, sec) => s + sec.heightCm, 0)} cm
                    </span>
                  </div>

                  {/* Bölüm listesi */}
                  <div className="space-y-1.5">
                    {customSections.map((sec, idx) => (
                      <div key={sec.id} className="flex items-center gap-1.5 bg-slate-50 rounded-xl px-2 py-1.5 border border-slate-200">
                        {/* Tür seçici */}
                        <select
                          value={sec.type}
                          onChange={e => setCustomSections(prev => prev.map(s =>
                            s.id === sec.id ? { ...s, type: e.target.value as CustomSection["type"] } : s
                          ))}
                          className="text-[10px] bg-white border border-slate-200 rounded-lg px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-primary/40 text-slate-600 flex-shrink-0"
                        >
                          <option value="shelf">Raf</option>
                          <option value="drawer">Çekmece</option>
                          <option value="hanger">Askılık</option>
                          <option value="open">Açık</option>
                        </select>

                        {/* Yükseklik input */}
                        <input
                          type="number"
                          min={10}
                          max={250}
                          value={sec.heightCm}
                          onChange={e => {
                            const v = parseInt(e.target.value) || 10;
                            setCustomSections(prev => prev.map(s =>
                              s.id === sec.id ? { ...s, heightCm: Math.max(10, Math.min(250, v)) } : s
                            ));
                          }}
                          className="w-14 text-[10px] text-center bg-white border border-slate-200 rounded-lg px-1 py-1 focus:outline-none focus:ring-1 focus:ring-primary/40 text-slate-700 font-semibold"
                        />
                        <span className="text-[10px] text-slate-400 flex-shrink-0">cm</span>

                        {/* Yukarı/aşağı */}
                        <div className="flex flex-col gap-0.5 ml-auto flex-shrink-0">
                          <button
                            disabled={idx === 0}
                            onClick={() => setCustomSections(prev => {
                              const arr = [...prev];
                              [arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]];
                              return arr;
                            })}
                            className="text-slate-300 hover:text-slate-600 disabled:opacity-20 leading-none text-[9px]"
                          >▲</button>
                          <button
                            disabled={idx === customSections.length - 1}
                            onClick={() => setCustomSections(prev => {
                              const arr = [...prev];
                              [arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]];
                              return arr;
                            })}
                            className="text-slate-300 hover:text-slate-600 disabled:opacity-20 leading-none text-[9px]"
                          >▼</button>
                        </div>

                        {/* Sil */}
                        <button
                          onClick={() => setCustomSections(prev => prev.filter(s => s.id !== sec.id))}
                          className="text-slate-300 hover:text-red-400 transition flex-shrink-0 text-[11px] ml-0.5"
                        >✕</button>
                      </div>
                    ))}
                  </div>

                  {/* Bölüm ekle butonları */}
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {(["shelf", "drawer", "hanger", "open"] as CustomSection["type"][]).map(type => {
                      const labels: Record<CustomSection["type"], string> = {
                        shelf: "+ Raf", drawer: "+ Çekmece", hanger: "+ Askılık", open: "+ Açık"
                      };
                      const defaults: Record<CustomSection["type"], number> = {
                        shelf: 35, drawer: 25, hanger: 120, open: 50
                      };
                      return (
                        <button
                          key={type}
                          onClick={() => {
                            nextSecId.current += 1;
                            setCustomSections(prev => [...prev, { id: nextSecId.current, type, heightCm: defaults[type] }]);
                          }}
                          className="px-2 py-1 rounded-lg bg-white border border-slate-200 hover:border-primary/40 hover:bg-primary/5 text-[10px] text-slate-500 hover:text-primary transition"
                        >
                          {labels[type]}
                        </button>
                      );
                    })}
                  </div>

                  {/* Odaya ekle */}
                  <button
                    onClick={() => { addCabinet("custom"); setShowCustomBuilder(false); }}
                    disabled={customSections.length === 0}
                    className="w-full py-2 rounded-xl bg-primary text-white text-xs font-semibold hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed transition mt-1"
                  >
                    Odaya Ekle →
                  </button>
                </div>
              )}
            </div>

            <p className="text-[11px] text-slate-400 pt-1">
              Üzerine tıkla → sürükle. Duvara yaklaşınca otomatik yapışır.
            </p>
          </div>

          {/* Seçili Dolap — Kaplama & Renk */}
          {selectedCab && (
            <div className="bg-white/80 backdrop-blur rounded-2xl shadow-sm border border-slate-200 p-4 space-y-4">
              <div className="text-xs font-semibold text-slate-700 flex items-center justify-between">
                <span>Seçili: {VARIANT_LABELS[selectedCab.variant]} #{selectedCab.id}</span>
                {selectedCab.lockedTo != null && (
                  <span className="text-amber-600" title="Yan yana kilitli">🔒</span>
                )}
              </div>

              {/* Genişlik / Yükseklik (cm) — 3D ile senkron */}
              <div className="grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-0.5">
                  <span className="text-[11px] text-slate-500">Genişlik (cm)</span>
                  <input
                    type="number"
                    min={40}
                    max={400}
                    value={Math.round(room.height * selectedCab.heightRatio * selectedCab.widthFactor)}
                    onChange={e => updateSelectedWidthCm(e.target.value)}
                    className="rounded-xl border border-slate-200 px-2 py-1.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                </label>
                <label className="flex flex-col gap-0.5">
                  <span className="text-[11px] text-slate-500">Yükseklik (cm)</span>
                  <input
                    type="number"
                    min={60}
                    max={room.height - 5}
                    value={Math.round(room.height * selectedCab.heightRatio)}
                    onChange={e => updateSelectedHeightCm(e.target.value)}
                    className="rounded-xl border border-slate-200 px-2 py-1.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                </label>
              </div>
              <p className="text-[10px] text-slate-400">Sağ yüzeyden genişlik, üst yüzeyden yükseklik sürükleyebilirsin.</p>

              {/* Kapaklı / Kapaksız */}
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-slate-500">Kapaklı</span>
                <button
                  role="switch"
                  aria-checked={selectedCab.hasDoor}
                  onClick={toggleSelectedHasDoor}
                  className={`relative w-10 h-5 rounded-full transition ${selectedCab.hasDoor ? "bg-primary" : "bg-slate-300"}`}
                >
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition left-0.5 ${selectedCab.hasDoor ? "translate-x-5" : "translate-x-0"}`} />
                </button>
              </div>

              {/* Yanındakine Kilitle */}
              <button
                type="button"
                onClick={lockSelectedToNeighbor}
                disabled={cabinets.length < 2}
                className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-xs font-medium text-slate-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {selectedCab.lockedTo != null ? "🔒 Kilitli" : "🔗 Yanındakine Kilitle"}
              </button>

              {/* Kaplama Türü */}
              <div>
                <div className="text-[11px] font-semibold text-slate-500 mb-2">Kaplama Türü</div>
                <div className="grid grid-cols-3 gap-1.5">
                  {(Object.entries(MATERIALS) as [MaterialType, MaterialDef][]).map(([key, mat]) => (
                    <button
                      key={key}
                      onClick={() => updateSelectedMaterial(key)}
                      className={`flex flex-col items-center gap-1 px-1 py-2 rounded-xl border text-[10px] font-medium transition ${
                        selectedCab.material === key
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-slate-200 hover:border-slate-300 text-slate-600"
                      }`}
                    >
                      {/* Kaplama önizlemesi: MDF düz, Lake %10 highlight, Akrilik %30 yansıma */}
                      <div
                        className="w-7 h-7 rounded-lg border border-slate-200 shadow-sm"
                        style={{
                          background:
                            key === "akrilik"
                              ? `linear-gradient(135deg, rgba(255,255,255,0.3) 0%, transparent 30%, ${selectedCab.colorHex} 70%)`
                              : key === "lake"
                              ? `linear-gradient(135deg, rgba(255,255,255,0.1) 0%, ${selectedCab.colorHex} 100%)`
                              : selectedCab.colorHex
                        }}
                      />
                      <span>{mat.label}</span>
                      <span className="text-[9px] text-slate-400">{mat.pricePerM2}₺/m²</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Renk Paleti */}
              <div>
                <div className="text-[11px] font-semibold text-slate-500 mb-2">
                  Renk
                  <span className="ml-1 font-normal text-slate-400">
                    — {MATERIALS[selectedCab.material].textureHint}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {COLOR_PALETTES[selectedCab.material].map(({ label, hex }) => (
                    <button
                      key={hex}
                      title={label}
                      onClick={() => updateSelectedColor(hex)}
                      className={`w-7 h-7 rounded-lg border-2 transition shadow-sm ${
                        selectedCab.colorHex === hex
                          ? "border-primary scale-110"
                          : "border-transparent hover:border-slate-300"
                      }`}
                      style={{ background: hex }}
                    />
                  ))}
                  {/* Özel renk seçici */}
                  <label
                    title="Özel renk"
                    className="w-7 h-7 rounded-lg border-2 border-dashed border-slate-300 cursor-pointer flex items-center justify-center text-slate-400 text-xs hover:border-primary transition relative overflow-hidden"
                  >
                    <input
                      type="color"
                      value={selectedCab.colorHex}
                      onChange={e => updateSelectedColor(e.target.value)}
                      className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                    />
                    +
                  </label>
                </div>
              </div>

              {/* Modül maliyet özeti */}
              <div className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 text-[11px] text-slate-600 space-y-1">
                <div className="flex justify-between">
                  <span>Kaplama türü</span>
                  <span>{MATERIALS[selectedCab.material].label}</span>
                </div>
                <div className="flex justify-between">
                  <span>Yüzey alanı</span>
                  <span>{cabinetSurfaceM2(selectedCab, room.height).toFixed(2)} m²</span>
                </div>
                <div className="flex justify-between font-semibold text-slate-800 pt-1 border-t border-slate-200">
                  <span>Bu modül ≈</span>
                  <span>{cabinetCost(selectedCab, room.height).toLocaleString("tr-TR")} ₺</span>
                </div>
              </div>

            </div>
          )}

          {/* Toplam Maliyet Paneli */}
          <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl shadow-sm p-4 text-white space-y-2">
            <div className="text-xs font-semibold text-slate-400">Tahmini Toplam Maliyet</div>
            <div className="text-2xl font-bold tracking-tight">
              {totalCost.toLocaleString("tr-TR")} ₺
            </div>

            {cabinets.length > 0 && (
              <div className="text-[11px] text-slate-400 space-y-0.5 pt-1 border-t border-slate-700">
                {cabinets.map(c => (
                  <div key={c.id} className="flex justify-between items-center">
                    <span className="flex items-center gap-1.5">
                      <span
                        className="inline-block w-2.5 h-2.5 rounded-sm flex-shrink-0"
                        style={{
                          background: c.colorHex,
                          border: "1px solid rgba(255,255,255,0.15)"
                        }}
                      />
                      {VARIANT_LABELS[c.variant]} · {MATERIALS[c.material].label}
                    </span>
                    <span className="font-medium text-slate-300">
                      {cabinetCost(c, room.height).toLocaleString("tr-TR")} ₺
                    </span>
                  </div>
                ))}
              </div>
            )}

            <p className="text-[10px] text-slate-500 pt-2 border-t border-slate-700">
              * İşçilik + kaplama malzemesi dahil, KDV hariç tahmini fiyattır.
            </p>
          </div>

          {/* Bu Kombini Kaydet */}
          <div className="bg-white/80 backdrop-blur rounded-2xl shadow-sm border border-slate-200 p-4 space-y-2">
            <div className="text-xs font-semibold text-slate-500">Kombin Kaydet</div>
            <div className="flex gap-2">
              <input
                type="text"
                value={saveLayoutName}
                onChange={e => setSaveLayoutName(e.target.value)}
                placeholder="Kombin adı"
                className="flex-1 rounded-xl border border-slate-200 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
              <button
                type="button"
                onClick={saveCurrentLayout}
                className="px-3 py-1.5 rounded-xl bg-primary text-white text-xs font-semibold hover:bg-blue-600"
              >
                Kaydet
              </button>
            </div>
            {savedLayouts.length > 0 && (
              <div className="space-y-1.5 pt-2 border-t border-slate-200">
                <div className="text-[11px] font-semibold text-slate-500">Kaydedilenler</div>
                {savedLayouts.map(l => (
                  <div
                    key={l.savedAt}
                    className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/80 px-2 py-1.5"
                  >
                    <button
                      type="button"
                      onClick={() => loadLayout(l)}
                      className="flex-1 text-left text-xs font-medium text-slate-700 truncate"
                    >
                      {l.name}
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteSavedLayout(l.savedAt)}
                      className="text-slate-400 hover:text-red-500 p-0.5"
                      title="Sil"
                    >
                      🗑
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

        </aside>
      </main>

      {/* ── Videodan Ölç modal ──────────────────────────────────────────────── */}
      {showVideoMeasure && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/90 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-white font-semibold">Videodan Ölç</span>
            <button onClick={stopVideoMeasure} className="text-white/80 hover:text-white text-sm">Kapat</button>
          </div>
          <video
            ref={videoMeasureRef}
            autoPlay
            playsInline
            muted
            className="flex-1 w-full max-h-[40vh] object-cover rounded-xl bg-black"
          />
          <p className="text-white/70 text-xs mt-2 mb-2">Kamerayı odaya tutun, aşağıya ölçüleri girin.</p>
          <div className="grid grid-cols-3 gap-2 mb-3">
            <label className="flex flex-col gap-0.5">
              <span className="text-white/70 text-[10px]">Genişlik (cm)</span>
              <input
                type="number"
                id="vm-width"
                defaultValue={room.width}
                className="rounded-lg px-2 py-1.5 text-sm bg-white text-slate-800"
              />
            </label>
            <label className="flex flex-col gap-0.5">
              <span className="text-white/70 text-[10px]">Derinlik (cm)</span>
              <input
                type="number"
                id="vm-depth"
                defaultValue={room.depth}
                className="rounded-lg px-2 py-1.5 text-sm bg-white text-slate-800"
              />
            </label>
            <label className="flex flex-col gap-0.5">
              <span className="text-white/70 text-[10px]">Yükseklik (cm)</span>
              <input
                type="number"
                id="vm-height"
                defaultValue={room.height}
                className="rounded-lg px-2 py-1.5 text-sm bg-white text-slate-800"
              />
            </label>
          </div>
          <button
            type="button"
            onClick={() => {
              const w = parseInt((document.getElementById("vm-width") as HTMLInputElement)?.value || "0", 10);
              const d = parseInt((document.getElementById("vm-depth") as HTMLInputElement)?.value || "0", 10);
              const h = parseInt((document.getElementById("vm-height") as HTMLInputElement)?.value || "0", 10);
              if (w > 0 && d > 0 && h > 0) applyVideoMeasure(w, d, h);
            }}
            className="w-full py-2.5 rounded-xl bg-primary text-white text-sm font-semibold"
          >
            Ölçümü Uygula
          </button>
        </div>
      )}

      {/* ── AR Modal ──────────────────────────────────────────────────────── */}
      {glbUrl && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full mx-4 p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-900">Odamda Gör (AR)</div>
              <button
                onClick={() => { URL.revokeObjectURL(glbUrl); setGlbUrl(null); }}
                className="text-xs text-slate-500 hover:text-slate-800"
              >
                Kapat
              </button>
            </div>
            <div className="rounded-2xl overflow-hidden border border-slate-200 bg-appbg">
              {/* @ts-expect-error model-viewer web component */}
              <model-viewer
                src={glbUrl}
                ar ar-modes="scene-viewer quick-look webxr"
                ar-placement="wall" camera-controls touch-action="pan-y"
                shadow-intensity="0.7"
                style={{ width: "100%", height: "300px", background: "#F8FAFC" }}
              />
            </div>
            <p className="text-[11px] text-slate-500">
              Telefonundan bu sayfayı açtığında AR butonunu görüp dolabı duvara yerleştirebilirsin.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}  };
  const handleBodyPM = (e: any) => {
    e.stopPropagation();
    if (!(e.target as HTMLElement).hasPointerCapture(e.pointerId)) return;
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const hit = new THREE.Vector3();
    e.ray.intersectPlane(plane, hit);
    const s = snapToWalls(hit.x, hit.z, room, W, D);
    onChangePosition(cab.id, s.x, s.z);
  };
  const handleBodyPU = (e: any) => {
    e.stopPropagation();
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    onInteractionEnd();
  };
  const bodyEvents = { onPointerDown: handleBodyPD, onPointerMove: handleBodyPM, onPointerUp: handleBodyPU };

  const handleWidthPD = (e: any) => {
    e.stopPropagation(); onSelect(cab.id); onInteractionStart();
    onWidthDragValue?.(Math.round(widthCm).toString());
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const handleWidthPM = (e: any) => {
    e.stopPropagation();
    if (!(e.target as HTMLElement).hasPointerCapture(e.pointerId)) return;
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const hit = new THREE.Vector3();
    e.ray.intersectPlane(plane, hit);
    const newWcm = Math.max(40, Math.min((Math.abs(hit.x - cab.x) / CM_TO_M) * 2, 400));
    onChangeWidthFactor(cab.id, newWcm / heightCm);
    onWidthDragValue?.(Math.round(newWcm).toString());
  };
  const handleWidthPU = (e: any) => {
    e.stopPropagation();
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    onWidthDragEnd?.();
    onInteractionEnd();
  };

  const handleHeightPD = (e: any) => {
    e.stopPropagation(); onSelect(cab.id); onInteractionStart();
    onHeightDragValue?.(Math.round(heightCm).toString());
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const handleHeightPM = (e: any) => {
    if (!onChangeHeightFactor) return;
    e.stopPropagation();
    if (!(e.target as HTMLElement).hasPointerCapture(e.pointerId)) return;
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -(cab.z + D / 2));
    const hit = new THREE.Vector3();
    e.ray.intersectPlane(plane, hit);
    const minH = 60 * CM_TO_M;
    const maxH = (room.height - 5) * CM_TO_M;
    const newHm = Math.max(minH, Math.min(maxH, hit.y));
    const newHr = newHm / (room.height * CM_TO_M);
    onChangeHeightFactor(cab.id, newHr);
    onHeightDragValue?.(Math.round(newHm / CM_TO_M).toString());
  };
  const handleHeightPU = (e: any) => {
    e.stopPropagation();
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    onHeightDragEnd?.();
    onInteractionEnd();
  };

  const widthDragEvents = { onPointerDown: handleWidthPD, onPointerMove: handleWidthPM, onPointerUp: handleWidthPU };
  const heightDragEvents = { onPointerDown: handleHeightPD, onPointerMove: handleHeightPM, onPointerUp: handleHeightPU };

  const matP = { ...matBase, color, emissive: selected ? "#ffffff" : "#000000", emissiveIntensity: selected ? 0.05 : 0 };
  const matInner = { ...matBase, color: innerColor, roughness: mat.roughness + 0.1 };
  const matMetal = { ...MAT_OFFSET, color: "#9CA3AF", metalness: 0.85, roughness: 0.15 };
  const matHandle = { ...MAT_OFFSET, color: "#6B7280", metalness: 0.75, roughness: 0.25 };

  const shelfHeights = cab.shelfHeightsCm && cab.shelfHeightsCm.length > 0
    ? cab.shelfHeightsCm
    : null;
  const shelfYs: number[] = [];
  if (cab.variant === "multiShelf") {
    if (shelfHeights && shelfHeights.length > 1) {
      let y = H / 2 - T;
      for (let i = 0; i < shelfHeights.length - 1; i++) {
        y -= shelfHeights[i] * CM_TO_M;
        shelfYs.push(y - H / 2);
      }
    } else if (shelfSpacingM > 0) {
      let y = T + shelfSpacingM;
      while (y < H - T - 0.01) { shelfYs.push(y - H / 2); y += shelfSpacingM; }
    }
  }
  if (cab.variant === "wardrobe" && shelfSpacingM > 0) {
    shelfYs.push(H / 2 - T - shelfSpacingM);
    shelfYs.push(-H / 2 + T + shelfSpacingM);
  }

  // drawerWardrobe: askı alanı SABİT 120 cm (üstten), altı çekmeceler
  const HANGER_HEIGHT_CM = 120;
  const hangerHeightM = HANGER_HEIGHT_CM * CM_TO_M;
  const dividerY = H / 2 - T - hangerHeightM; // group merkezine göre
  const drawerDivYs: number[] = [];
  if (cab.variant === "drawerWardrobe" && shelfSpacingM > 0) {
    let y = dividerY - shelfSpacingM;
    while (y > -H / 2 + T + 0.01) { drawerDivYs.push(y); y -= shelfSpacingM; }
  }

  const handleYs: number[] = [];
  if (cab.variant === "drawerWardrobe") {
    const segs = [dividerY, ...drawerDivYs, -H / 2 + T];
    for (let i = 0; i < segs.length - 1; i++) {
      handleYs.push((segs[i] + segs[i + 1]) / 2);
    }
  }

  // Askı çubuğu Y — askı alanının ortası
  const railY = cab.variant === "wardrobe" && shelfYs.length === 2
    ? (shelfYs[0] + shelfYs[1]) / 2
    : cab.variant === "drawerWardrobe"
    ? dividerY + hangerHeightM / 2
    : 0;

  // ── Bölüm ölçü etiketleri (3D Text yerine HTML overlay kullanılacak) ─────
  // Her bölüm için {y merkez, yükseklik cm} bilgisi
  type LabelInfo = { yCenter: number; heightCm: number; label: string };
  const dimensionLabels: LabelInfo[] = [];

  if (cab.variant === "multiShelf" && shelfYs.length > 0) {
    const boundaries = [H / 2 - T, ...shelfYs, -H / 2 + T].sort((a, b) => b - a);
    for (let i = 0; i < boundaries.length - 1; i++) {
      const top = boundaries[i], bot = boundaries[i + 1];
      const hCm = Math.round((top - bot) / CM_TO_M);
      dimensionLabels.push({ yCenter: (top + bot) / 2, heightCm: hCm, label: `${hCm} cm` });
    }
  }
  if (cab.variant === "drawerWardrobe") {
    // Askı bölümü
    dimensionLabels.push({ yCenter: dividerY + hangerHeightM / 2, heightCm: HANGER_HEIGHT_CM, label: `${HANGER_HEIGHT_CM} cm` });
    // Çekmece bölümleri
    const segs = [dividerY, ...drawerDivYs, -H / 2 + T].sort((a, b) => b - a);
    for (let i = 0; i < segs.length - 1; i++) {
      const top = segs[i], bot = segs[i + 1];
      const hCm = Math.round((top - bot) / CM_TO_M);
      dimensionLabels.push({ yCenter: (top + bot) / 2, heightCm: hCm, label: `${hCm} cm` });
    }
  }
  if (cab.variant === "wardrobe" && shelfYs.length === 2) {
    const topRafH = Math.round((H / 2 - T - shelfYs[0]) / CM_TO_M);
    const midH    = Math.round((shelfYs[0] - shelfYs[1]) / CM_TO_M);
    const botH    = Math.round((shelfYs[1] + H / 2 - T) / CM_TO_M);
    dimensionLabels.push({ yCenter: (H / 2 - T + shelfYs[0]) / 2, heightCm: topRafH, label: `${topRafH} cm` });
    dimensionLabels.push({ yCenter: (shelfYs[0] + shelfYs[1]) / 2, heightCm: midH,   label: `${midH} cm` });
    dimensionLabels.push({ yCenter: (shelfYs[1] - H / 2 + T) / 2, heightCm: botH,   label: `${botH} cm` });
  }

  return (
    <group position={[cab.x, H / 2, cab.z]} rotation={[0, cab.rotation, 0]}>

      {/* ── 5 Gövde Paneli ──────────────────────────────────────────────── */}
      {/* Taban */}
      <mesh castShadow receiveShadow position={[0, -H / 2 + T / 2, 0]} {...bodyEvents}>
        <boxGeometry args={[W, T, D]} />
        <meshStandardMaterial {...matP} {...MAT_OFFSET} />
      </mesh>
      {/* Tavan — yükseklik sürükle */}
      <mesh castShadow receiveShadow position={[0, H / 2 - T / 2, 0]} {...heightDragEvents}>
        <boxGeometry args={[W, T, D]} />
        <meshStandardMaterial {...matP} {...MAT_OFFSET} />
      </mesh>
      {/* Sol yan */}
      <mesh castShadow receiveShadow position={[-W / 2 + T / 2, 0, 0]} {...bodyEvents}>
        <boxGeometry args={[T, H - T * 2, D]} />
        <meshStandardMaterial {...matP} {...MAT_OFFSET} />
      </mesh>
      {/* Sağ yan — genişlik sürükle */}
      <mesh castShadow receiveShadow position={[W / 2 - T / 2, 0, 0]} {...widthDragEvents}>
        <boxGeometry args={[T, H - T * 2, D]} />
        <meshStandardMaterial {...matP} {...MAT_OFFSET} />
      </mesh>
      {/* Arka panel */}
      <mesh castShadow position={[0, 0, -D / 2 + T * 0.4]} {...bodyEvents}>
        <boxGeometry args={[W - T * 2, H - T * 2, T * 0.5]} />
        <meshStandardMaterial {...matInner} {...MAT_OFFSET} />
      </mesh>

      {/* ── Kapak (hasDoor) ────────────────────────────────────────────────── */}
      {cab.hasDoor && (
        <mesh castShadow position={[0, 0, D / 2 + T / 2]}>
          <boxGeometry args={[W - T * 2, H - T * 2, T]} />
          <meshStandardMaterial {...matP} {...MAT_OFFSET} />
        </mesh>
      )}

      {/* ── Raflar (çift tıkla bölüm yüksekliğini düzenle) ─────────────────── */}
      {cab.variant === "multiShelf" && shelfYs.map((yPos, i) => {
        const isEditing = editingShelf?.cabId === cab.id && editingShelf?.sectionIndex === i;
        const sectionHeightCm = shelfHeights?.[i] ?? cab.shelfSpacingCm;
        return (
          <group key={`s${i}`} position={[0, yPos, 0]}>
            <mesh
              castShadow
              onDoubleClick={(e) => { e.stopPropagation(); onShelfDoubleClick?.(cab.id, i); }}
            >
              <boxGeometry args={[W - T * 2, T, D - T * 1.5]} />
              <meshStandardMaterial {...MAT_OFFSET} color={color} metalness={mat.metalness} roughness={mat.roughness} />
            </mesh>
            {isEditing && (
              <Html position={[0, 0.08, 0]} center distanceFactor={3} style={{ pointerEvents: "auto" }}>
                <input
                  type="number"
                  min={10}
                  max={250}
                  defaultValue={sectionHeightCm}
                  className="w-14 rounded px-1.5 py-0.5 text-xs font-semibold bg-white border border-slate-300 shadow-lg text-slate-800"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const v = parseInt((e.target as HTMLInputElement).value, 10);
                      if (!Number.isNaN(v)) onShelfHeightSubmit?.(cab.id, i, v);
                    }
                  }}
                  onBlur={(e) => {
                    const v = parseInt((e.target as HTMLInputElement).value, 10);
                    if (!Number.isNaN(v)) onShelfHeightSubmit?.(cab.id, i, v);
                  }}
                  autoFocus
                />
              </Html>
            )}
          </group>
        );
      })}
      {cab.variant !== "multiShelf" && shelfYs.map((yPos, i) => (
        <mesh key={`s${i}`} castShadow position={[0, yPos, 0]}>
          <boxGeometry args={[W - T * 2, T, D - T * 1.5]} />
          <meshStandardMaterial {...MAT_OFFSET} color={color} metalness={mat.metalness} roughness={mat.roughness} />
        </mesh>
      ))}

      {/* ── drawerWardrobe: orta bölme ──────────────────────────────────── */}
      {cab.variant === "drawerWardrobe" && (
        <mesh castShadow position={[0, dividerY, 0]}>
          <boxGeometry args={[W - T * 2, T, D - T * 1.5]} />
          <meshStandardMaterial {...MAT_OFFSET} color={color} metalness={mat.metalness} roughness={mat.roughness} />
        </mesh>
      )}

      {/* ── Çekmece ara bölmeleri (ince çizgi) ──────────────────────────── */}
      {drawerDivYs.map((yPos, i) => (
        <mesh key={`dd${i}`} position={[0, yPos, D / 2 - T * 0.6]}>
          <boxGeometry args={[W - T * 2.5, T * 0.4, T * 0.25]} />
          <meshStandardMaterial color={shadeColor(color, -30)} roughness={0.9} />
        </mesh>
      ))}

      {/* ── Çekmece tutamaçları (kapaksız: önde; kapaklı: kapak üzerinde) ─── */}
      {handleYs.map((yPos, i) => (
        <group key={`h${i}`} position={[0, yPos, cab.hasDoor ? D / 2 + T + 0.003 : D / 2 + 0.003]}>
          <mesh>
            <boxGeometry args={[W * 0.3, 0.013, 0.013]} />
            <meshStandardMaterial {...matHandle} />
          </mesh>
          <mesh position={[-W * 0.14, -0.02, -0.005]}>
            <boxGeometry args={[0.009, 0.024, 0.009]} />
            <meshStandardMaterial {...matHandle} />
          </mesh>
          <mesh position={[W * 0.14, -0.02, -0.005]}>
            <boxGeometry args={[0.009, 0.024, 0.009]} />
            <meshStandardMaterial {...matHandle} />
          </mesh>
        </group>
      ))}

      {/* ── Askı çubuğu ─────────────────────────────────────────────────── */}
      {(cab.variant === "wardrobe" || cab.variant === "drawerWardrobe") && (
        <group position={[0, railY, -D * 0.15]}>
          <mesh rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.009, 0.009, W - T * 2.5, 16]} />
            <meshStandardMaterial {...matMetal} />
          </mesh>
          <mesh position={[-(W - T * 2.5) / 2, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.014, 0.014, 0.014, 12]} />
            <meshStandardMaterial {...matHandle} />
          </mesh>
          <mesh position={[(W - T * 2.5) / 2, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.014, 0.014, 0.014, 12]} />
            <meshStandardMaterial {...matHandle} />
          </mesh>
        </group>
      )}

      {/* ── Özel modül bölümleri ─────────────────────────────────────────── */}
      {cab.variant === "custom" && cab.customSections && (() => {
        const sections = cab.customSections!;
        const totalCm = sections.reduce((s, sec) => s + sec.heightCm, 0);
        if (totalCm === 0) return null;
        const scale = (H - T * 2) / (totalCm * CM_TO_M);
        const elements: React.ReactNode[] = [];
        let curY = H / 2 - T; // top, counting down

        sections.forEach((sec, i) => {
          const secH = sec.heightCm * CM_TO_M * scale;
          const secCenterY = curY - secH / 2;
          const botY = curY - secH;

          // Bölme çizgisi (alta)
          if (i < sections.length - 1) {
            elements.push(
              <mesh key={`cdiv${i}`} castShadow position={[0, botY, 0]}>
                <boxGeometry args={[W - T * 2, T, D - T * 1.5]} />
                <meshStandardMaterial color={color} metalness={mat.metalness} roughness={mat.roughness} />
              </mesh>
            );
          }

          // Bölüm içeriği
          if (sec.type === "drawer") {
            // Çekmece tutamaçları
            elements.push(
              <group key={`csec${i}`} position={[0, secCenterY, D / 2 + 0.003]}>
                <mesh>
                  <boxGeometry args={[W * 0.3, 0.013, 0.013]} />
                  <meshStandardMaterial color="#6B7280" metalness={0.75} roughness={0.25} />
                </mesh>
                <mesh position={[-W * 0.14, -0.02, -0.005]}>
                  <boxGeometry args={[0.009, 0.024, 0.009]} />
                  <meshStandardMaterial color="#6B7280" metalness={0.75} roughness={0.25} />
                </mesh>
                <mesh position={[W * 0.14, -0.02, -0.005]}>
                  <boxGeometry args={[0.009, 0.024, 0.009]} />
                  <meshStandardMaterial color="#6B7280" metalness={0.75} roughness={0.25} />
                </mesh>
              </group>
            );
          } else if (sec.type === "hanger") {
            elements.push(
              <group key={`csec${i}`} position={[0, secCenterY, -D * 0.15]}>
                <mesh rotation={[0, 0, Math.PI / 2]}>
                  <cylinderGeometry args={[0.009, 0.009, W - T * 2.5, 16]} />
                  <meshStandardMaterial color="#9CA3AF" metalness={0.85} roughness={0.15} />
                </mesh>
                <mesh position={[-(W - T * 2.5) / 2, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
                  <cylinderGeometry args={[0.014, 0.014, 0.014, 12]} />
                  <meshStandardMaterial color="#6B7280" metalness={0.7} roughness={0.3} />
                </mesh>
                <mesh position={[(W - T * 2.5) / 2, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
                  <cylinderGeometry args={[0.014, 0.014, 0.014, 12]} />
                  <meshStandardMaterial color="#6B7280" metalness={0.7} roughness={0.3} />
                </mesh>
              </group>
            );
          }
          // shelf & open: sadece bölme çizgisi yeterli

          // Boyut etiketi
          elements.push(
            <Html key={`clbl${i}`} position={[W / 2 + 0.02, secCenterY, 0]} center distanceFactor={4} style={{ pointerEvents: "none" }}>
              <div style={{ fontSize: "9px", color: "rgba(0,0,0,0.3)", whiteSpace: "nowrap", fontFamily: "system-ui, sans-serif", userSelect: "none" }}>
                {sec.heightCm} cm
              </div>
            </Html>
          );

          curY = botY;
        });
        return elements;
      })()}
      {selected && (
        <lineSegments>
          <edgesGeometry args={[new THREE.BoxGeometry(W + 0.008, H + 0.008, D + 0.008)]} />
          <lineBasicMaterial color="#F59E0B" />
        </lineSegments>
      )}

      {/* ── Bölüm ölçü etiketleri ────────────────────────────────────────── */}
      {dimensionLabels.map((lbl, i) => (
        <Html
          key={`lbl${i}`}
          position={[W / 2 + 0.02, lbl.yCenter, 0]}
          center
          distanceFactor={4}
          style={{ pointerEvents: "none" }}
        >
          <div style={{
            fontSize: "9px",
            color: "rgba(0,0,0,0.3)",
            background: "transparent",
            whiteSpace: "nowrap",
            fontFamily: "system-ui, sans-serif",
            letterSpacing: "0.02em",
            userSelect: "none",
          }}>
            {lbl.label}
          </div>
        </Html>
      ))}

      {/* ── Sürükleme tooltip (genişlik/yükseklik cm) ─────────────────────── */}
      {dragMeasure && (
        <Html position={[0, dragMeasure.type === "height" ? H / 2 - T : 0, D / 2 + 0.05]} center distanceFactor={3} style={{ pointerEvents: "none" }}>
          <div className="rounded px-2 py-1 text-xs font-semibold bg-white text-slate-800 shadow-md whitespace-nowrap">
            {dragMeasure.value} cm
          </div>
        </Html>
      )}
    </group>
  );
}

// ─── Varsayılan dolap oluşturucu ──────────────────────────────────────────────

function createCabinet(id: number, variant: CabinetVariant, customSections?: CustomSection[]): Cabinet {
  const base = {
    id, x: 0, z: 0, variant, rotation: 0,
    material: "mdflam" as MaterialType,
    colorHex: COLOR_PALETTES.mdflam[0].hex,
    shelfSpacingCm: 35,
    hasDoor: false,
    lockedTo: null as number | null
  };
  if (variant === "drawerWardrobe") return { ...base, heightRatio: 0.82, widthFactor: 0.23, depthFactor: 0.22 };
  if (variant === "multiShelf")     return { ...base, heightRatio: 0.90, widthFactor: 0.12, depthFactor: 0.20 };
  if (variant === "custom")         return { ...base, heightRatio: 0.90, widthFactor: 0.23, depthFactor: 0.22, customSections: customSections ?? [] };
  return                                   { ...base, heightRatio: 0.90, widthFactor: 0.23, depthFactor: 0.22 };
}

// ─── Ana Sayfa ────────────────────────────────────────────────────────────────

export default function Page() {
  const [room, setRoom]         = useState<RoomSize>({ width: 400, depth: 400, height: 260 });
  const [cabinets, setCabinets] = useState<Cabinet[]>([{ ...createCabinet(1, "drawerWardrobe"), x: -1 }]);
  const [selectedId, setSelectedId] = useState<number | null>(1);
  const exportGroupRef = useRef<THREE.Group | null>(null);
  const [glbUrl, setGlbUrl]       = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [orbitInteracting, setOrbitInteracting] = useState(false);
  const [savedLayouts, setSavedLayouts] = useState<SavedLayout[]>([]);
  const [saveLayoutName, setSaveLayoutName] = useState("");
  const [showVideoMeasure, setShowVideoMeasure] = useState(false);
  const videoMeasureRef = useRef<HTMLVideoElement | null>(null);
  const videoStreamRef = useRef<MediaStream | null>(null);
  const [editingShelf, setEditingShelf] = useState<{ cabId: number; sectionIndex: number } | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as SavedLayout[];
        setSavedLayouts(Array.isArray(parsed) ? parsed : []);
      }
    } catch {
      setSavedLayouts([]);
    }
  }, []);

  const persistSavedLayouts = (list: SavedLayout[]) => {
    setSavedLayouts(list);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch {}
  };

  const saveCurrentLayout = () => {
    const name = saveLayoutName.trim() || `Kombin ${new Date().toLocaleDateString("tr-TR")}`;
    const layout: SavedLayout = {
      name,
      cabinets: cabinets.map(c => ({ ...c })),
      room: { ...room },
      savedAt: Date.now()
    };
    persistSavedLayouts([...savedLayouts, layout]);
    setSaveLayoutName("");
  };

  const loadLayout = (layout: SavedLayout) => {
    setRoom(layout.room);
    setCabinets(layout.cabinets.map(c => ({
      ...c,
      hasDoor: c.hasDoor ?? false,
      lockedTo: c.lockedTo ?? null
    })));
    setSelectedId(layout.cabinets[0]?.id ?? null);
  };

  const deleteSavedLayout = (savedAt: number) => {
    persistSavedLayouts(savedLayouts.filter(l => l.savedAt !== savedAt));
  };

  const downloadPDF = () => {
    alert("PDF özelliği yakında eklenecek.");
  };

  const startVideoMeasure = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      videoStreamRef.current = stream;
      setShowVideoMeasure(true);
      setTimeout(() => {
        if (videoMeasureRef.current) videoMeasureRef.current.srcObject = stream;
      }, 100);
    } catch {
      alert("Kamera erişimi yok. Tarayıcı izni verin veya cihazınızda kamera olduğundan emin olun.");
    }
  };

  const stopVideoMeasure = () => {
    videoStreamRef.current?.getTracks().forEach(t => t.stop());
    videoStreamRef.current = null;
    setShowVideoMeasure(false);
  };

  const applyVideoMeasure = (w: number, d: number, h: number) => {
    setRoom(prev => ({ ...prev, width: w, depth: d, height: h }));
    stopVideoMeasure();
  };

  // ── Özel modül tasarımcısı state ────────────────────────────────────────
  const [showCustomBuilder, setShowCustomBuilder] = useState(false);
  const [customSections, setCustomSections] = useState<CustomSection[]>([
    { id: 1, type: "hanger", heightCm: 120 },
    { id: 2, type: "shelf",  heightCm: 40 },
  ]);
  const nextSecId = React.useRef(10);

  // ── Dolap yönetimi ───────────────────────────────────────────────────────

  const addCabinet = (variant: CabinetVariant) => {
    const id = cabinets.length ? Math.max(...cabinets.map(c => c.id)) + 1 : 1;
    const sections = variant === "custom" ? customSections.map(s => ({ ...s })) : undefined;
    setCabinets(prev => [...prev, createCabinet(id, variant, sections)]);
    setSelectedId(id);
  };

  const deleteSelected = () => {
    if (selectedId == null) return;
    setCabinets(prev => {
      const next = prev.filter(c => c.id !== selectedId);
      return next.map(c => (c.lockedTo === selectedId ? { ...c, lockedTo: null } : c));
    });
    setSelectedId(null);
  };

  const updateCabinetPosition = (id: number, x: number, z: number) => {
    setCabinets(prev => {
      const cab = prev.find(c => c.id === id);
      if (!cab) return prev;
      const dx = x - cab.x;
      const dz = z - cab.z;
      return prev.map(c => {
        if (c.id === id) return { ...c, x, z };
        if (c.lockedTo === id) return { ...c, x: c.x + dx, z: c.z + dz };
        if (cab.lockedTo === c.id) return { ...c, x: c.x + dx, z: c.z + dz };
        return c;
      });
    });
  };

  const updateCabinetWidthFactor = (id: number, widthFactor: number) =>
    setCabinets(prev => prev.map(c => c.id === id ? { ...c, widthFactor } : c));

  const updateCabinetHeightFactor = (id: number, heightRatio: number) =>
    setCabinets(prev => prev.map(c => c.id === id ? { ...c, heightRatio } : c));

  const [dragMeasure, setDragMeasure] = useState<{ cabId: number; value: string; type: "width" | "height" } | null>(null);
  const dragMeasureTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleDragMeasureHide = () => {
    if (dragMeasureTimeoutRef.current) clearTimeout(dragMeasureTimeoutRef.current);
    dragMeasureTimeoutRef.current = setTimeout(() => {
      setDragMeasure(null);
      dragMeasureTimeoutRef.current = null;
    }, 1500);
  };
  const handleWidthDragValue = (cabId: number, value: string) =>
    setDragMeasure({ cabId, value, type: "width" });
  const handleHeightDragValue = (cabId: number, value: string) =>
    setDragMeasure({ cabId, value, type: "height" });
  const handleWidthDragEnd = () => scheduleDragMeasureHide();
  const handleHeightDragEnd = () => scheduleDragMeasureHide();

  const rotateSelectedCabinet = () => {
    if (selectedId == null) return;
    setCabinets(prev => prev.map(c =>
      c.id === selectedId
        ? { ...c, rotation: (c.rotation + Math.PI / 2) % (Math.PI * 2) }
        : c
    ));
  };

  const updateSelectedMaterial = (material: MaterialType) => {
    if (selectedId == null) return;
    const firstColor = COLOR_PALETTES[material][0].hex;
    setCabinets(prev => prev.map(c =>
      c.id === selectedId ? { ...c, material, colorHex: firstColor } : c
    ));
  };

  const updateSelectedColor = (colorHex: string) => {
    if (selectedId == null) return;
    setCabinets(prev => prev.map(c => c.id === selectedId ? { ...c, colorHex } : c));
  };

  const updateSelectedShelfSpacing = (val: string) => {
    if (selectedId == null) return;
    const num = parseFloat(val);
    if (!Number.isNaN(num) && num > 5) {
      setCabinets(prev => prev.map(c =>
        c.id === selectedId ? { ...c, shelfSpacingCm: num } : c
      ));
    }
  };

  const updateSelectedWidthCm = (val: string) => {
    if (selectedId == null || !selectedCab) return;
    const num = parseInt(val, 10);
    if (Number.isNaN(num) || num < 40 || num > 400) return;
    const heightCm = room.height * selectedCab.heightRatio;
    setCabinets(prev => prev.map(c =>
      c.id === selectedId ? { ...c, widthFactor: num / heightCm } : c
    ));
  };
  const updateSelectedHeightCm = (val: string) => {
    if (selectedId == null) return;
    const num = parseInt(val, 10);
    if (Number.isNaN(num) || num < 60 || num > room.height - 5) return;
    setCabinets(prev => prev.map(c =>
      c.id === selectedId ? { ...c, heightRatio: num / room.height } : c
    ));
  };
  const toggleSelectedHasDoor = () => {
    if (selectedId == null) return;
    setCabinets(prev => prev.map(c =>
      c.id === selectedId ? { ...c, hasDoor: !c.hasDoor } : c
    ));
  };
  const updateCabinetShelfHeight = (cabId: number, sectionIndex: number, heightCm: number) => {
    setCabinets(prev => prev.map(c => {
      if (c.id !== cabId || c.variant !== "multiShelf") return c;
      const cab = c;
      let heights = cab.shelfHeightsCm;
      if (!heights || heights.length === 0) {
        const H = room.height * cab.heightRatio * CM_TO_M;
        const T = PANEL_THICKNESS;
        const n = Math.max(2, Math.floor((H - 2 * T) / (cab.shelfSpacingCm * CM_TO_M)));
        heights = Array(n).fill(Math.round((H - 2 * T) / CM_TO_M / n));
      }
      const next = [...heights];
      if (sectionIndex >= 0 && sectionIndex < next.length) {
        next[sectionIndex] = Math.max(10, Math.min(250, heightCm));
      }
      return { ...c, shelfHeightsCm: next };
    }));
    setEditingShelf(null);
  };

  const lockSelectedToNeighbor = () => {
    if (selectedId == null || !selectedCab) return;
    const others = cabinets.filter(c => c.id !== selectedId);
    if (others.length === 0) return;
    const halfW = (selectedCab.widthFactor * room.height * selectedCab.heightRatio * CM_TO_M) / 2;
    const halfD = (selectedCab.depthFactor * room.height * selectedCab.heightRatio * CM_TO_M) / 2;
    let nearest: { id: number; dist: number } | null = null;
    for (const o of others) {
      const ow = (o.widthFactor * room.height * o.heightRatio * CM_TO_M) / 2;
      const od = (o.depthFactor * room.height * o.heightRatio * CM_TO_M) / 2;
      const dist = Math.hypot(selectedCab.x - o.x, selectedCab.z - o.z);
      if (dist < (nearest?.dist ?? Infinity)) nearest = { id: o.id, dist };
    }
    if (!nearest) return;
    const other = cabinets.find(c => c.id === nearest!.id)!;
    let dx = other.x - selectedCab.x;
    let dz = other.z - selectedCab.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.01) return;
    dx /= dist;
    dz /= dist;
    const ow = (other.widthFactor * room.height * other.heightRatio * CM_TO_M) / 2;
    const od = (other.depthFactor * room.height * other.heightRatio * CM_TO_M) / 2;
    let snapX = other.x - dx * (halfW + ow);
    let snapZ = other.z - dz * (halfD + od);
    snapX = snapToGrid(snapX);
    snapZ = snapToGrid(snapZ);
    setCabinets(prev => prev.map(c => {
      if (c.id === selectedId) return { ...c, x: snapX, z: snapZ, lockedTo: nearest!.id };
      if (c.id === nearest!.id) return { ...c, lockedTo: selectedId };
      return c;
    }));
  };

  const handleRoomChange = (field: keyof RoomSize, value: string) => {
    const num = parseInt(value || "0", 10);
    if (!Number.isNaN(num)) setRoom(prev => ({ ...prev, [field]: num }));
  };

  const handleExportAR = async () => {
    if (!exportGroupRef.current) return;
    try {
      setExporting(true);
      if (glbUrl) URL.revokeObjectURL(glbUrl);
      const blob = await exportObjectToGLB(exportGroupRef.current);
      setGlbUrl(URL.createObjectURL(blob));
    } finally {
      setExporting(false);
    }
  };

  // ── Hesaplamalar ─────────────────────────────────────────────────────────

  const roomWidthM  = room.width  * CM_TO_M;
  const roomDepthM  = room.depth  * CM_TO_M;
  const roomHeightM = room.height * CM_TO_M;
  const roomM2      = (room.width * room.depth) / 10000;
  const totalCost   = cabinets.reduce((sum, c) => sum + cabinetCost(c, room.height), 0);
  const selectedCab = cabinets.find(c => c.id === selectedId) ?? null;

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen flex flex-col bg-appbg">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-8 py-4 border-b border-slate-200 bg-white/80 backdrop-blur">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-2xl bg-primary/10 flex items-center justify-center">
            <span className="text-primary font-bold text-sm">M</span>
          </div>
          <div>
            <div className="font-semibold tracking-tight text-slate-900">ModuPlan</div>
            <div className="text-xs text-slate-500">Kod bilmeden 3D mobilya tasarla &amp; AR&apos;da gör</div>
          </div>
        </div>
        <button
          onClick={handleExportAR}
          disabled={exporting}
          className="px-4 py-2 rounded-2xl bg-primary text-white text-xs font-semibold shadow-sm hover:bg-blue-600 disabled:opacity-60 disabled:cursor-not-allowed transition"
        >
          {exporting ? "Hazırlanıyor..." : "Odamda Gör (AR)"}
        </button>
      </header>

      <main className="flex-1 flex gap-4 px-6 py-6">

        {/* ── 3D Sahne ──────────────────────────────────────────────────── */}
        <section className="flex-1 relative">
          <div className="w-full h-full rounded-2xl shadow-xl overflow-hidden" style={{ background: "#F8F9FA" }}>
            <Canvas shadows camera={{ position: [4, 4, 4], fov: 45 }}>
              <color attach="background" args={["#F8F9FA"]} />
              <ambientLight intensity={0.65} />
              <directionalLight position={[5, 8, 5]} intensity={0.5} castShadow />

              {/* Zemin */}
              <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow position={[0, 0, 0]}>
                <planeGeometry args={[roomWidthM, roomDepthM]} />
                <meshStandardMaterial color="#EDEDEF" />
              </mesh>

              <Grid
                args={[roomWidthM, roomDepthM]}
                cellSize={0.5} cellThickness={0.25} cellColor="#D1D5DB"
                sectionSize={1} sectionThickness={0.8} sectionColor="#9CA3AF"
                position={[0, 0.001, 0]}
              />

              {/* Duvarlar */}
              <mesh position={[0, roomHeightM / 2, -roomDepthM / 2]}>
                <boxGeometry args={[roomWidthM, roomHeightM, 0.05]} />
                <meshStandardMaterial color="#E5E7EB" />
              </mesh>
              <mesh position={[-roomWidthM / 2, roomHeightM / 2, 0]}>
                <boxGeometry args={[0.05, roomHeightM, roomDepthM]} />
                <meshStandardMaterial color="#E5E7EB" />
              </mesh>
              <mesh position={[roomWidthM / 2, roomHeightM / 2, 0]}>
                <boxGeometry args={[0.05, roomHeightM, roomDepthM]} />
                <meshStandardMaterial color="#E5E7EB" />
              </mesh>

              {/* Dolaplar */}
              <group ref={exportGroupRef}>
                {cabinets.map(cab => (
                  <CabinetMesh
                    key={cab.id}
                    cab={cab}
                    room={room}
                    selected={cab.id === selectedId}
                    onChangePosition={updateCabinetPosition}
                    onChangeWidthFactor={updateCabinetWidthFactor}
                    onChangeHeightFactor={updateCabinetHeightFactor}
                    onSelect={setSelectedId}
                    onInteractionStart={() => setOrbitInteracting(true)}
                    onInteractionEnd={() => setOrbitInteracting(false)}
                    dragMeasure={dragMeasure?.cabId === cab.id ? { value: dragMeasure.value, type: dragMeasure.type } : null}
                    onWidthDragValue={v => handleWidthDragValue(cab.id, v)}
                    onHeightDragValue={v => handleHeightDragValue(cab.id, v)}
                    onWidthDragEnd={handleWidthDragEnd}
                    onHeightDragEnd={handleHeightDragEnd}
                    editingShelf={editingShelf}
                    onShelfDoubleClick={(cid, idx) => setEditingShelf({ cabId: cid, sectionIndex: idx })}
                    onShelfHeightSubmit={updateCabinetShelfHeight}
                  />
                ))}
              </group>

              <OrbitControls
                makeDefault enablePan enableZoom
                enableRotate={!orbitInteracting}
                maxPolarAngle={Math.PI / 2.1}
              />
            </Canvas>

            {/* ── Seçili mobilya üstü butonlar ── */}
            {selectedCab && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 pointer-events-none">
                <div className="flex items-center gap-2 bg-slate-900/80 backdrop-blur-md border border-slate-700 rounded-2xl px-3 py-2 shadow-xl pointer-events-auto">
                  {/* Mobilya adı */}
                  <div className="flex items-center gap-1.5 pr-2 border-r border-slate-700">
                    <span
                      className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                      style={{ background: selectedCab.colorHex, border: "1px solid rgba(255,255,255,0.2)" }}
                    />
                    <span className="text-xs text-slate-300 font-medium whitespace-nowrap">
                      {VARIANT_LABELS[selectedCab.variant]}
                    </span>
                  </div>

                  {/* Döndür */}
                  <button
                    onClick={rotateSelectedCabinet}
                    title="90° Döndür"
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold transition"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                      <path d="M3 3v5h5"/>
                    </svg>
                    90°
                  </button>

                  {/* Sil */}
                  <button
                    onClick={deleteSelected}
                    title="Sil"
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-red-500/20 hover:bg-red-500/40 text-red-400 hover:text-red-300 text-xs font-semibold transition border border-red-500/30"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6"/>
                      <path d="M19 6l-1 14H6L5 6"/>
                      <path d="M10 11v6M14 11v6"/>
                      <path d="M9 6V4h6v2"/>
                    </svg>
                    Sil
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* ── Sağ Panel ─────────────────────────────────────────────────── */}
        <aside className="w-80 space-y-4 overflow-y-auto max-h-[calc(100vh-120px)]">

          {/* PDF İndir */}
          <button
            type="button"
            onClick={downloadPDF}
            className="w-full py-2.5 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 flex items-center justify-center gap-2"
          >
            PDF İndir
          </button>

          {/* Oda Ölçüleri */}
          <div className="bg-white/80 backdrop-blur rounded-2xl shadow-sm border border-slate-200 p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-semibold text-slate-500">Oda Ölçüleri</div>
              <div className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-lg">
                {roomM2.toFixed(1)} m²
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs">
              {(["width", "depth", "height"] as (keyof RoomSize)[]).map((field, i) => (
                <label key={field} className="flex flex-col gap-1">
                  <span className="text-slate-500">{["Genişlik", "Derinlik", "Yükseklik"][i]} (cm)</span>
                  <input
                    type="number"
                    value={room[field]}
                    onChange={e => handleRoomChange(field, e.target.value)}
                    className="rounded-xl border border-slate-200 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                </label>
              ))}
            </div>
            <button
              type="button"
              onClick={startVideoMeasure}
              className="mt-3 w-full py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-medium text-slate-700"
            >
              Videodan Ölç
            </button>
          </div>

          {/* Modül Ekle */}
          <div className="bg-white/80 backdrop-blur rounded-2xl shadow-sm border border-slate-200 p-4 space-y-2">
            <div className="text-xs font-semibold text-slate-500 mb-1">Modül Ekle</div>

            {/* Hazır modüller */}
            {(["drawerWardrobe", "multiShelf", "wardrobe"] as CabinetVariant[]).map(v => (
              <button
                key={v}
                onClick={() => addCabinet(v)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-slate-200 hover:bg-primary/5 hover:border-primary/30 text-xs transition group"
              >
                <span className="text-slate-500 group-hover:text-primary transition flex-shrink-0">
                  {VARIANT_SVG[v]}
                </span>
                <span className="font-medium text-slate-700">{VARIANT_LABELS[v]}</span>
                <span className="ml-auto text-[10px] text-slate-400">+ Ekle</span>
              </button>
            ))}

            {/* Özel Modül Tasarla */}
            <div className="pt-1 border-t border-slate-100">
              <button
                onClick={() => setShowCustomBuilder(v => !v)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-xs transition group ${
                  showCustomBuilder
                    ? "border-primary/40 bg-primary/5 text-primary"
                    : "border-dashed border-slate-300 hover:border-primary/40 hover:bg-primary/5 text-slate-500 hover:text-primary"
                }`}
              >
                <span className="flex-shrink-0">{VARIANT_SVG.custom}</span>
                <span className="font-medium">Özel Modül Tasarla</span>
                <span className="ml-auto text-[10px] opacity-60">{showCustomBuilder ? "▲" : "▼"}</span>
              </button>

              {showCustomBuilder && (
                <div className="mt-3 space-y-2">
                  {/* Toplam yükseklik göstergesi */}
                  <div className="flex items-center justify-between text-[10px] text-slate-400 px-1">
                    <span>Toplam</span>
                    <span className={`font-semibold ${
                      customSections.reduce((s, sec) => s + sec.heightCm, 0) > 260
                        ? "text-red-500" : "text-slate-600"
                    }`}>
                      {customSections.reduce((s, sec) => s + sec.heightCm, 0)} cm
                    </span>
                  </div>

                  {/* Bölüm listesi */}
                  <div className="space-y-1.5">
                    {customSections.map((sec, idx) => (
                      <div key={sec.id} className="flex items-center gap-1.5 bg-slate-50 rounded-xl px-2 py-1.5 border border-slate-200">
                        {/* Tür seçici */}
                        <select
                          value={sec.type}
                          onChange={e => setCustomSections(prev => prev.map(s =>
                            s.id === sec.id ? { ...s, type: e.target.value as CustomSection["type"] } : s
                          ))}
                          className="text-[10px] bg-white border border-slate-200 rounded-lg px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-primary/40 text-slate-600 flex-shrink-0"
                        >
                          <option value="shelf">Raf</option>
                          <option value="drawer">Çekmece</option>
                          <option value="hanger">Askılık</option>
                          <option value="open">Açık</option>
                        </select>

                        {/* Yükseklik input */}
                        <input
                          type="number"
                          min={10}
                          max={250}
                          value={sec.heightCm}
                          onChange={e => {
                            const v = parseInt(e.target.value) || 10;
                            setCustomSections(prev => prev.map(s =>
                              s.id === sec.id ? { ...s, heightCm: Math.max(10, Math.min(250, v)) } : s
                            ));
                          }}
                          className="w-14 text-[10px] text-center bg-white border border-slate-200 rounded-lg px-1 py-1 focus:outline-none focus:ring-1 focus:ring-primary/40 text-slate-700 font-semibold"
                        />
                        <span className="text-[10px] text-slate-400 flex-shrink-0">cm</span>

                        {/* Yukarı/aşağı */}
                        <div className="flex flex-col gap-0.5 ml-auto flex-shrink-0">
                          <button
                            disabled={idx === 0}
                            onClick={() => setCustomSections(prev => {
                              const arr = [...prev];
                              [arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]];
                              return arr;
                            })}
                            className="text-slate-300 hover:text-slate-600 disabled:opacity-20 leading-none text-[9px]"
                          >▲</button>
                          <button
                            disabled={idx === customSections.length - 1}
                            onClick={() => setCustomSections(prev => {
                              const arr = [...prev];
                              [arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]];
                              return arr;
                            })}
                            className="text-slate-300 hover:text-slate-600 disabled:opacity-20 leading-none text-[9px]"
                          >▼</button>
                        </div>

                        {/* Sil */}
                        <button
                          onClick={() => setCustomSections(prev => prev.filter(s => s.id !== sec.id))}
                          className="text-slate-300 hover:text-red-400 transition flex-shrink-0 text-[11px] ml-0.5"
                        >✕</button>
                      </div>
                    ))}
                  </div>

                  {/* Bölüm ekle butonları */}
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {(["shelf", "drawer", "hanger", "open"] as CustomSection["type"][]).map(type => {
                      const labels: Record<CustomSection["type"], string> = {
                        shelf: "+ Raf", drawer: "+ Çekmece", hanger: "+ Askılık", open: "+ Açık"
                      };
                      const defaults: Record<CustomSection["type"], number> = {
                        shelf: 35, drawer: 25, hanger: 120, open: 50
                      };
                      return (
                        <button
                          key={type}
                          onClick={() => {
                            nextSecId.current += 1;
                            setCustomSections(prev => [...prev, { id: nextSecId.current, type, heightCm: defaults[type] }]);
                          }}
                          className="px-2 py-1 rounded-lg bg-white border border-slate-200 hover:border-primary/40 hover:bg-primary/5 text-[10px] text-slate-500 hover:text-primary transition"
                        >
                          {labels[type]}
                        </button>
                      );
                    })}
                  </div>

                  {/* Odaya ekle */}
                  <button
                    onClick={() => { addCabinet("custom"); setShowCustomBuilder(false); }}
                    disabled={customSections.length === 0}
                    className="w-full py-2 rounded-xl bg-primary text-white text-xs font-semibold hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed transition mt-1"
                  >
                    Odaya Ekle →
                  </button>
                </div>
              )}
            </div>

            <p className="text-[11px] text-slate-400 pt-1">
              Üzerine tıkla → sürükle. Duvara yaklaşınca otomatik yapışır.
            </p>
          </div>

          {/* Seçili Dolap — Kaplama & Renk */}
          {selectedCab && (
            <div className="bg-white/80 backdrop-blur rounded-2xl shadow-sm border border-slate-200 p-4 space-y-4">
              <div className="text-xs font-semibold text-slate-700 flex items-center justify-between">
                <span>Seçili: {VARIANT_LABELS[selectedCab.variant]} #{selectedCab.id}</span>
                {selectedCab.lockedTo != null && (
                  <span className="text-amber-600" title="Yan yana kilitli">🔒</span>
                )}
              </div>

              {/* Genişlik / Yükseklik (cm) — 3D ile senkron */}
              <div className="grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-0.5">
                  <span className="text-[11px] text-slate-500">Genişlik (cm)</span>
                  <input
                    type="number"
                    min={40}
                    max={400}
                    value={Math.round(room.height * selectedCab.heightRatio * selectedCab.widthFactor)}
                    onChange={e => updateSelectedWidthCm(e.target.value)}
                    className="rounded-xl border border-slate-200 px-2 py-1.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                </label>
                <label className="flex flex-col gap-0.5">
                  <span className="text-[11px] text-slate-500">Yükseklik (cm)</span>
                  <input
                    type="number"
                    min={60}
                    max={room.height - 5}
                    value={Math.round(room.height * selectedCab.heightRatio)}
                    onChange={e => updateSelectedHeightCm(e.target.value)}
                    className="rounded-xl border border-slate-200 px-2 py-1.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                </label>
              </div>
              <p className="text-[10px] text-slate-400">Sağ yüzeyden genişlik, üst yüzeyden yükseklik sürükleyebilirsin.</p>

              {/* Kapaklı / Kapaksız */}
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-slate-500">Kapaklı</span>
                <button
                  role="switch"
                  aria-checked={selectedCab.hasDoor}
                  onClick={toggleSelectedHasDoor}
                  className={`relative w-10 h-5 rounded-full transition ${selectedCab.hasDoor ? "bg-primary" : "bg-slate-300"}`}
                >
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition left-0.5 ${selectedCab.hasDoor ? "translate-x-5" : "translate-x-0"}`} />
                </button>
              </div>

              {/* Yanındakine Kilitle */}
              <button
                type="button"
                onClick={lockSelectedToNeighbor}
                disabled={cabinets.length < 2}
                className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-xs font-medium text-slate-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {selectedCab.lockedTo != null ? "🔒 Kilitli" : "🔗 Yanındakine Kilitle"}
              </button>

              {/* Kaplama Türü */}
              <div>
                <div className="text-[11px] font-semibold text-slate-500 mb-2">Kaplama Türü</div>
                <div className="grid grid-cols-3 gap-1.5">
                  {(Object.entries(MATERIALS) as [MaterialType, MaterialDef][]).map(([key, mat]) => (
                    <button
                      key={key}
                      onClick={() => updateSelectedMaterial(key)}
                      className={`flex flex-col items-center gap-1 px-1 py-2 rounded-xl border text-[10px] font-medium transition ${
                        selectedCab.material === key
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-slate-200 hover:border-slate-300 text-slate-600"
                      }`}
                    >
                      {/* Kaplama önizlemesi: MDF düz, Lake %10 highlight, Akrilik %30 yansıma */}
                      <div
                        className="w-7 h-7 rounded-lg border border-slate-200 shadow-sm"
                        style={{
                          background:
                            key === "akrilik"
                              ? `linear-gradient(135deg, rgba(255,255,255,0.3) 0%, transparent 30%, ${selectedCab.colorHex} 70%)`
                              : key === "lake"
                              ? `linear-gradient(135deg, rgba(255,255,255,0.1) 0%, ${selectedCab.colorHex} 100%)`
                              : selectedCab.colorHex
                        }}
                      />
                      <span>{mat.label}</span>
                      <span className="text-[9px] text-slate-400">{mat.pricePerM2}₺/m²</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Renk Paleti */}
              <div>
                <div className="text-[11px] font-semibold text-slate-500 mb-2">
                  Renk
                  <span className="ml-1 font-normal text-slate-400">
                    — {MATERIALS[selectedCab.material].textureHint}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {COLOR_PALETTES[selectedCab.material].map(({ label, hex }) => (
                    <button
                      key={hex}
                      title={label}
                      onClick={() => updateSelectedColor(hex)}
                      className={`w-7 h-7 rounded-lg border-2 transition shadow-sm ${
                        selectedCab.colorHex === hex
                          ? "border-primary scale-110"
                          : "border-transparent hover:border-slate-300"
                      }`}
                      style={{ background: hex }}
                    />
                  ))}
                  {/* Özel renk seçici */}
                  <label
                    title="Özel renk"
                    className="w-7 h-7 rounded-lg border-2 border-dashed border-slate-300 cursor-pointer flex items-center justify-center text-slate-400 text-xs hover:border-primary transition relative overflow-hidden"
                  >
                    <input
                      type="color"
                      value={selectedCab.colorHex}
                      onChange={e => updateSelectedColor(e.target.value)}
                      className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                    />
                    +
                  </label>
                </div>
              </div>

              {/* Modül maliyet özeti */}
              <div className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 text-[11px] text-slate-600 space-y-1">
                <div className="flex justify-between">
                  <span>Kaplama türü</span>
                  <span>{MATERIALS[selectedCab.material].label}</span>
                </div>
                <div className="flex justify-between">
                  <span>Yüzey alanı</span>
                  <span>{cabinetSurfaceM2(selectedCab, room.height).toFixed(2)} m²</span>
                </div>
                <div className="flex justify-between font-semibold text-slate-800 pt-1 border-t border-slate-200">
                  <span>Bu modül ≈</span>
                  <span>{cabinetCost(selectedCab, room.height).toLocaleString("tr-TR")} ₺</span>
                </div>
              </div>

            </div>
          )}

          {/* Toplam Maliyet Paneli */}
          <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl shadow-sm p-4 text-white space-y-2">
            <div className="text-xs font-semibold text-slate-400">Tahmini Toplam Maliyet</div>
            <div className="text-2xl font-bold tracking-tight">
              {totalCost.toLocaleString("tr-TR")} ₺
            </div>

            {cabinets.length > 0 && (
              <div className="text-[11px] text-slate-400 space-y-0.5 pt-1 border-t border-slate-700">
                {cabinets.map(c => (
                  <div key={c.id} className="flex justify-between items-center">
                    <span className="flex items-center gap-1.5">
                      <span
                        className="inline-block w-2.5 h-2.5 rounded-sm flex-shrink-0"
                        style={{
                          background: c.colorHex,
                          border: "1px solid rgba(255,255,255,0.15)"
                        }}
                      />
                      {VARIANT_LABELS[c.variant]} · {MATERIALS[c.material].label}
                    </span>
                    <span className="font-medium text-slate-300">
                      {cabinetCost(c, room.height).toLocaleString("tr-TR")} ₺
                    </span>
                  </div>
                ))}
              </div>
            )}

            <p className="text-[10px] text-slate-500 pt-2 border-t border-slate-700">
              * İşçilik + kaplama malzemesi dahil, KDV hariç tahmini fiyattır.
            </p>
          </div>

          {/* Bu Kombini Kaydet */}
          <div className="bg-white/80 backdrop-blur rounded-2xl shadow-sm border border-slate-200 p-4 space-y-2">
            <div className="text-xs font-semibold text-slate-500">Kombin Kaydet</div>
            <div className="flex gap-2">
              <input
                type="text"
                value={saveLayoutName}
                onChange={e => setSaveLayoutName(e.target.value)}
                placeholder="Kombin adı"
                className="flex-1 rounded-xl border border-slate-200 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
              <button
                type="button"
                onClick={saveCurrentLayout}
                className="px-3 py-1.5 rounded-xl bg-primary text-white text-xs font-semibold hover:bg-blue-600"
              >
                Kaydet
              </button>
            </div>
            {savedLayouts.length > 0 && (
              <div className="space-y-1.5 pt-2 border-t border-slate-200">
                <div className="text-[11px] font-semibold text-slate-500">Kaydedilenler</div>
                {savedLayouts.map(l => (
                  <div
                    key={l.savedAt}
                    className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/80 px-2 py-1.5"
                  >
                    <button
                      type="button"
                      onClick={() => loadLayout(l)}
                      className="flex-1 text-left text-xs font-medium text-slate-700 truncate"
                    >
                      {l.name}
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteSavedLayout(l.savedAt)}
                      className="text-slate-400 hover:text-red-500 p-0.5"
                      title="Sil"
                    >
                      🗑
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

        </aside>
      </main>

      {/* ── Videodan Ölç modal ──────────────────────────────────────────────── */}
      {showVideoMeasure && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/90 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-white font-semibold">Videodan Ölç</span>
            <button onClick={stopVideoMeasure} className="text-white/80 hover:text-white text-sm">Kapat</button>
          </div>
          <video
            ref={videoMeasureRef}
            autoPlay
            playsInline
            muted
            className="flex-1 w-full max-h-[40vh] object-cover rounded-xl bg-black"
          />
          <p className="text-white/70 text-xs mt-2 mb-2">Kamerayı odaya tutun, aşağıya ölçüleri girin.</p>
          <div className="grid grid-cols-3 gap-2 mb-3">
            <label className="flex flex-col gap-0.5">
              <span className="text-white/70 text-[10px]">Genişlik (cm)</span>
              <input
                type="number"
                id="vm-width"
                defaultValue={room.width}
                className="rounded-lg px-2 py-1.5 text-sm bg-white text-slate-800"
              />
            </label>
            <label className="flex flex-col gap-0.5">
              <span className="text-white/70 text-[10px]">Derinlik (cm)</span>
              <input
                type="number"
                id="vm-depth"
                defaultValue={room.depth}
                className="rounded-lg px-2 py-1.5 text-sm bg-white text-slate-800"
              />
            </label>
            <label className="flex flex-col gap-0.5">
              <span className="text-white/70 text-[10px]">Yükseklik (cm)</span>
              <input
                type="number"
                id="vm-height"
                defaultValue={room.height}
                className="rounded-lg px-2 py-1.5 text-sm bg-white text-slate-800"
              />
            </label>
          </div>
          <button
            type="button"
            onClick={() => {
              const w = parseInt((document.getElementById("vm-width") as HTMLInputElement)?.value || "0", 10);
              const d = parseInt((document.getElementById("vm-depth") as HTMLInputElement)?.value || "0", 10);
              const h = parseInt((document.getElementById("vm-height") as HTMLInputElement)?.value || "0", 10);
              if (w > 0 && d > 0 && h > 0) applyVideoMeasure(w, d, h);
            }}
            className="w-full py-2.5 rounded-xl bg-primary text-white text-sm font-semibold"
          >
            Ölçümü Uygula
          </button>
        </div>
      )}

      {/* ── AR Modal ──────────────────────────────────────────────────────── */}
      {glbUrl && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full mx-4 p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-900">Odamda Gör (AR)</div>
              <button
                onClick={() => { URL.revokeObjectURL(glbUrl); setGlbUrl(null); }}
                className="text-xs text-slate-500 hover:text-slate-800"
              >
                Kapat
              </button>
            </div>
            <div className="rounded-2xl overflow-hidden border border-slate-200 bg-appbg">
              {/* @ts-expect-error model-viewer web component */}
              <model-viewer
                src={glbUrl}
                ar ar-modes="scene-viewer quick-look webxr"
                ar-placement="wall" camera-controls touch-action="pan-y"
                shadow-intensity="0.7"
                style={{ width: "100%", height: "300px", background: "#F8FAFC" }}
              />
            </div>
            <p className="text-[11px] text-slate-500">
              Telefonundan bu sayfayı açtığında AR butonunu görüp dolabı duvara yerleştirebilirsin.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
