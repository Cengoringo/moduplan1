'use client';
// @ts-nocheck
/// <reference types="@react-three/fiber" />
import React, { useRef, useState, useEffect } from "react";
import { Canvas } from "@react-three/fiber";
import { Grid, OrbitControls, Html } from "@react-three/drei";
import * as THREE from "three";
import { exportObjectToGLB } from "../lib/export-glb";

// ─── Tipler ──────────────────────────────────────────────────────────────────

type RoomSize = {
  width: number;  // cm
  depth: number;  // cm
  height: number; // cm
};

type CabinetVariant = "drawerWardrobe" | "multiShelf" | "wardrobe" | "custom";

type DoorStyle = "classic" | "flat" | "shaker"; // klasik göbekli | düz | çerçeveli

type MaterialType = "mdflam" | "lake" | "akrilik";

type CustomSection = {
  id: number;
  type: "shelf" | "drawer" | "deep-drawer" | "hanger" | "jewelry-drawer" | "shoe-rack" | "open";
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
  doorStyle?: DoorStyle;
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
const HANGER_HEIGHT_CM = 120;

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
  editingShelf, onShelfDoubleClick, onShelfHeightSubmit,
  onSectionResize, onChangeDepthFactor, onDepthDragValue, onDepthDragEnd
}: {
  cab: Cabinet; room: RoomSize; selected: boolean;
  onChangePosition: (id: number, x: number, z: number) => void;
  onChangeWidthFactor: (id: number, wf: number) => void;
  onChangeHeightFactor?: (id: number, hr: number) => void;
  onSelect: (id: number) => void;
  onInteractionStart: () => void;
  onInteractionEnd: () => void;
  dragMeasure: { value: string; type: "width" | "height" | "depth" } | null;
  onWidthDragValue?: (v: string) => void;
  onHeightDragValue?: (v: string) => void;
  onWidthDragEnd?: () => void;
  onHeightDragEnd?: () => void;
  editingShelf: { cabId: number; sectionIndex: number } | null;
  onShelfDoubleClick?: (cabId: number, sectionIndex: number) => void;
  onShelfHeightSubmit?: (cabId: number, sectionIndex: number, heightCm: number) => void;
  onSectionResize?: (cabId: number, divIdx: number, newTopH: number, newBotH: number) => void;
  onChangeDepthFactor?: (id: number, df: number) => void;
  onDepthDragValue?: (v: string) => void;
  onDepthDragEnd?: () => void;
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

  const widthDragEvents  = { onPointerDown: handleWidthPD,  onPointerMove: handleWidthPM,  onPointerUp: handleWidthPU  };
  const heightDragEvents = { onPointerDown: handleHeightPD, onPointerMove: handleHeightPM, onPointerUp: handleHeightPU };

  // ── Derinlik sürükleme (ön panel) ──────────────────────────────────────
  const handleDepthPD = (e: any) => {
    e.stopPropagation(); onSelect(cab.id); onInteractionStart();
    onDepthDragValue?.(Math.round(depthCm).toString());
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const handleDepthPM = (e: any) => {
    if (!onChangeDepthFactor) return;
    e.stopPropagation();
    if (!(e.target as HTMLElement).hasPointerCapture(e.pointerId)) return;
    const plane = new THREE.Plane(new THREE.Vector3(1, 0, 0), -cab.x);
    const hit = new THREE.Vector3();
    e.ray.intersectPlane(plane, hit);
    const newDcm = Math.max(20, Math.min(120, (Math.abs(hit.z - cab.z) / CM_TO_M) * 2));
    onChangeDepthFactor(cab.id, newDcm / heightCm);
    onDepthDragValue?.(Math.round(newDcm).toString());
  };
  const handleDepthPU = (e: any) => {
    e.stopPropagation();
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    onDepthDragEnd?.();
    onInteractionEnd();
  };
  const depthDragEvents = { onPointerDown: handleDepthPD, onPointerMove: handleDepthPM, onPointerUp: handleDepthPU };

  const matP = { ...matBase, color, emissive: selected ? "#ffffff" : "#000000", emissiveIntensity: selected ? 0.05 : 0 };
  const matInner = { ...matBase, color: innerColor, roughness: mat.roughness + 0.1 };
  const matMetal = { ...MAT_OFFSET, color: "#9CA3AF", metalness: 0.85, roughness: 0.15 };
  const matHandle = { ...MAT_OFFSET, color: "#6B7280", metalness: 0.75, roughness: 0.25 };

  const shelfHeights = cab.shelfHeightsCm && cab.shelfHeightsCm.length > 0
    ? cab.shelfHeightsCm
    : null;

  // Raf sayısını sabit tut — yükseklik değişince aralık ölçeklenir
  const innerH = H - T * 2;
  const nominalSpacingM = cab.shelfSpacingCm * CM_TO_M;
  // Başlangıç yüksekliğinde kaç raf varsa aynı sayıyı koru
  const baseH = room.height * (cab.variant === "drawerWardrobe" ? 0.82 : 0.90) * CM_TO_M;
  const baseInnerH = baseH - T * 2;
  const shelfCount = nominalSpacingM > 0 ? Math.max(1, Math.round(baseInnerH / nominalSpacingM)) : 0;
  const scaledSpacingM = shelfCount > 0 ? innerH / (shelfCount + 1) : 0;

  const shelfYs: number[] = [];
  if (cab.variant === "multiShelf") {
    if (shelfHeights && shelfHeights.length > 1) {
      // shelfHeights orantılı ölçekle
      const totalCm = shelfHeights.reduce((a, b) => a + b, 0);
      const scaleFactor = totalCm > 0 ? (innerH / CM_TO_M) / totalCm : 1;
      let y = H / 2 - T;
      for (let i = 0; i < shelfHeights.length - 1; i++) {
        y -= shelfHeights[i] * scaleFactor * CM_TO_M;
        shelfYs.push(y - H / 2);
      }
    } else if (scaledSpacingM > 0) {
      let y = T + scaledSpacingM;
      while (y < H - T - 0.01) { shelfYs.push(y - H / 2); y += scaledSpacingM; }
    }
  }
  if (cab.variant === "wardrobe") {
    // Üst ve alt rafları orantılı konumlandır (başlangıç oranı ~35cm/toplam yükseklik)
    const SHELF_RATIO = 35 / 213;
    const shelfOffsetM = H * SHELF_RATIO;
    shelfYs.push(H / 2 - T - shelfOffsetM);
    shelfYs.push(-H / 2 + T + shelfOffsetM);
  }

  // drawerWardrobe: askı alanı ORANSAL (başlangıç yüksekliğindeki orana göre)
  const HANGER_RATIO = 120 / 213; // 120cm / varsayılan dolap yüksekliği
  const hangerHeightM = H * HANGER_RATIO;
  const dividerY = H / 2 - T - hangerHeightM;
  const drawerSpacingM = hangerHeightM > 0 ? Math.max(0.1, scaledSpacingM) : 0;
  const drawerDivYs: number[] = [];
  if (cab.variant === "drawerWardrobe" && drawerSpacingM > 0) {
    let y = dividerY - drawerSpacingM;
    while (y > -H / 2 + T + 0.01) { drawerDivYs.push(y); y -= drawerSpacingM; }
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

      {/* ── Yükseklik sürükleme ikonu ── */}
      {selected && (
        <Html position={[0, H / 2 + 0.07, D / 2]} center distanceFactor={3} style={{ pointerEvents: "none" }}>
          <div style={{
            background: "rgba(37,99,235,0.90)",
            borderRadius: "6px",
            padding: "4px 5px",
            display: "flex",
            alignItems: "center",
            boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
            userSelect: "none",
          }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
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

      {/* ── Genişlik sürükleme ikonu ── */}
      {selected && (
        <Html position={[W / 2 + 0.05, 0, D / 2]} center distanceFactor={3} style={{ pointerEvents: "none" }}>
          <div style={{
            background: "rgba(37,99,235,0.90)",
            borderRadius: "6px",
            padding: "4px 5px",
            display: "flex",
            alignItems: "center",
            boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
            userSelect: "none",
          }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
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
      {/* Ön sürükleme paneli — derinlik ayarı */}
      <mesh castShadow receiveShadow position={[0, 0, D / 2 - T / 2]} {...depthDragEvents}>
        <boxGeometry args={[W - T * 2, H - T * 2, T]} />
        <meshStandardMaterial {...matP} {...MAT_OFFSET} transparent opacity={cab.hasDoor ? 0 : 1} />
      </mesh>
      {/* ── Derinlik sürükleme ikonu ── */}
      {selected && !cab.hasDoor && (
        <Html position={[0, -H / 2 - 0.06, D / 2]} center distanceFactor={3} style={{ pointerEvents: "none" }}>
          <div style={{
            background: "rgba(16,185,129,0.90)",
            borderRadius: "6px", padding: "4px 5px",
            display: "flex", alignItems: "center",
            boxShadow: "0 2px 8px rgba(0,0,0,0.2)", userSelect: "none",
          }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
              <path d="M5 12h14M12 5l-4 7h8l-4-7zM12 19l-4-7h8l-4 7z"/>
            </svg>
          </div>
        </Html>
      )}

      {/* ── Kapak — Klasik göbekli çerçeve kapak ────────────────────────────── */}
      {cab.hasDoor && (() => {
        const doorW   = W - T * 2;
        const doorH   = H - T * 2;
        const doorT   = T * 1.8;
        const isDouble = widthCm > 45;
        const gap      = 0.005;

        // Renk tonları
        const frameC  = shadeColor(color, -18);  // çerçeve koyu
        const panelC  = shadeColor(color, +10);  // göbek açık
        const shadowC = shadeColor(color, -35);  // iç gölge
        const lightC  = shadeColor(color, +22);  // ışık vurgusu

        // Klasik göbekli kapak bileşeni
        const ClassicDoor = ({ x, w, handleSide }: { x: number; w: number; handleSide: "left" | "right" }) => {
          const fw  = 0.038;  // çerçeve genişliği
          const fz  = doorT;
          const pz  = doorT - 0.006; // göbek biraz içeride
          const pw  = w - fw * 2 - 0.012;
          const ph  = doorH - fw * 2 - 0.012;

          // Yatay iki bölüm (üst + alt göbek)
          const topH  = ph * 0.42;
          const botH  = ph - topH - 0.010;
          const topY  =  (botH / 2 + 0.005);
          const botY  = -(topH / 2 + 0.005);

          return (
            <group position={[x, 0, D / 2 + fz / 2]}>

              {/* ── Ana kapak gövdesi ── */}
              <mesh castShadow receiveShadow>
                <boxGeometry args={[w, doorH, fz]} />
                <meshStandardMaterial color={frameC} metalness={mat.metalness} roughness={mat.roughness + 0.05} {...MAT_OFFSET} />
              </mesh>

              {/* ── Üst göbek ── */}
              {/* Gölge (biraz büyük, koyu) */}
              <mesh position={[0, topY, pz / 2 - 0.001]}>
                <boxGeometry args={[pw + 0.006, topH + 0.006, 0.001]} />
                <meshStandardMaterial color={shadowC} {...MAT_OFFSET} />
              </mesh>
              {/* Göbek yüzeyi */}
              <mesh position={[0, topY, pz / 2]}>
                <boxGeometry args={[pw, topH, 0.005]} />
                <meshStandardMaterial color={panelC} metalness={mat.metalness} roughness={mat.roughness - 0.05} {...MAT_OFFSET} />
              </mesh>
              {/* Göbek üst ışık çizgisi */}
              <mesh position={[0, topY + topH / 2 - 0.003, pz / 2 + 0.003]}>
                <boxGeometry args={[pw, 0.004, 0.003]} />
                <meshStandardMaterial color={lightC} {...MAT_OFFSET} />
              </mesh>
              {/* Göbek sol ışık çizgisi */}
              <mesh position={[-pw / 2 + 0.003, topY, pz / 2 + 0.003]}>
                <boxGeometry args={[0.004, topH, 0.003]} />
                <meshStandardMaterial color={lightC} {...MAT_OFFSET} />
              </mesh>

              {/* ── Alt göbek ── */}
              <mesh position={[0, botY, pz / 2 - 0.001]}>
                <boxGeometry args={[pw + 0.006, botH + 0.006, 0.001]} />
                <meshStandardMaterial color={shadowC} {...MAT_OFFSET} />
              </mesh>
              <mesh position={[0, botY, pz / 2]}>
                <boxGeometry args={[pw, botH, 0.005]} />
                <meshStandardMaterial color={panelC} metalness={mat.metalness} roughness={mat.roughness - 0.05} {...MAT_OFFSET} />
              </mesh>
              <mesh position={[0, botY + botH / 2 - 0.003, pz / 2 + 0.003]}>
                <boxGeometry args={[pw, 0.004, 0.003]} />
                <meshStandardMaterial color={lightC} {...MAT_OFFSET} />
              </mesh>
              <mesh position={[-pw / 2 + 0.003, botY, pz / 2 + 0.003]}>
                <boxGeometry args={[0.004, botH, 0.003]} />
                <meshStandardMaterial color={lightC} {...MAT_OFFSET} />
              </mesh>

              {/* ── Metal kulp ── */}
              <group position={[
                handleSide === "right" ? w * 0.36 : -w * 0.36,
                0,
                fz / 2 + 0.016
              ]}>
                {/* Kulp çubuğu */}
                <mesh>
                  <boxGeometry args={[0.010, 0.090, 0.010]} />
                  <meshStandardMaterial color="#B0B8C0" metalness={0.92} roughness={0.08} {...MAT_OFFSET} />
                </mesh>
                {/* Üst rozet */}
                <mesh position={[0,  0.050, -0.004]}>
                  <cylinderGeometry args={[0.008, 0.008, 0.012, 10]} />
                  <meshStandardMaterial color="#9CA3AF" metalness={0.88} roughness={0.12} {...MAT_OFFSET} />
                </mesh>
                {/* Alt rozet */}
                <mesh position={[0, -0.050, -0.004]}>
                  <cylinderGeometry args={[0.008, 0.008, 0.012, 10]} />
                  <meshStandardMaterial color="#9CA3AF" metalness={0.88} roughness={0.12} {...MAT_OFFSET} />
                </mesh>
              </group>

            </group>
          );
        };

        if (isDouble) {
          const halfW = (doorW - gap) / 2;
          return (
            <>
              <ClassicDoor x={-(halfW / 2 + gap / 2)} w={halfW} handleSide="right" />
              <ClassicDoor x={ (halfW / 2 + gap / 2)} w={halfW} handleSide="left"  />
            </>
          );
        }

        return <ClassicDoor x={0} w={doorW} handleSide="right" />;
      })()}

      {/* ── Düz (Flat) Kapak ── */}
      {cab.hasDoor && cab.doorStyle === "flat" && (() => {
        const doorW   = W - T * 2;
        const doorH   = H - T * 2;
        const doorT   = T * 1.6;
        const isDouble = widthCm > 45;
        const gap      = 0.005;
        const FlatDoor = ({ x, w, handleSide }: { x: number; w: number; handleSide: "left" | "right" }) => (
          <group position={[x, 0, D / 2 + doorT / 2]}>
            <mesh castShadow receiveShadow>
              <boxGeometry args={[w, doorH, doorT]} />
              <meshStandardMaterial color={color} metalness={mat.metalness + 0.05} roughness={mat.roughness - 0.08} {...MAT_OFFSET} />
            </mesh>
            {/* Yatay ince tutamaç */}
            <mesh position={[handleSide === "right" ? w * 0.28 : -w * 0.28, 0, doorT / 2 + 0.008]}>
              <boxGeometry args={[0.06, 0.008, 0.008]} />
              <meshStandardMaterial color="#9CA3AF" metalness={0.9} roughness={0.1} {...MAT_OFFSET} />
            </mesh>
          </group>
        );
        if (isDouble) {
          const halfW = (doorW - gap) / 2;
          return <><FlatDoor x={-(halfW / 2 + gap / 2)} w={halfW} handleSide="right" /><FlatDoor x={(halfW / 2 + gap / 2)} w={halfW} handleSide="left" /></>;
        }
        return <FlatDoor x={0} w={doorW} handleSide="right" />;
      })()}

      {/* ── Shaker (Çerçeveli) Kapak ── */}
      {cab.hasDoor && cab.doorStyle === "shaker" && (() => {
        const doorW   = W - T * 2;
        const doorH   = H - T * 2;
        const doorT   = T * 1.8;
        const isDouble = widthCm > 45;
        const gap      = 0.005;
        const fc = shadeColor(color, -12); // çerçeve rengi
        const pc = shadeColor(color, +8);  // panel rengi
        const fw = 0.032; // çerçeve genişliği
        const ShakerDoor = ({ x, w, handleSide }: { x: number; w: number; handleSide: "left" | "right" }) => (
          <group position={[x, 0, D / 2 + doorT / 2]}>
            {/* Dış çerçeve */}
            <mesh castShadow receiveShadow>
              <boxGeometry args={[w, doorH, doorT]} />
              <meshStandardMaterial color={fc} metalness={mat.metalness} roughness={mat.roughness + 0.08} {...MAT_OFFSET} />
            </mesh>
            {/* İç panel (hafif içeride) */}
            <mesh position={[0, 0, 0.002]}>
              <boxGeometry args={[w - fw * 2, doorH - fw * 2, doorT * 0.6]} />
              <meshStandardMaterial color={pc} metalness={mat.metalness} roughness={mat.roughness} {...MAT_OFFSET} />
            </mesh>
            {/* Tutamaç */}
            <group position={[handleSide === "right" ? w * 0.32 : -w * 0.32, 0, doorT / 2 + 0.014]}>
              <mesh><boxGeometry args={[0.010, 0.080, 0.010]} /><meshStandardMaterial color="#B0B8C0" metalness={0.9} roughness={0.1} {...MAT_OFFSET} /></mesh>
              <mesh position={[0, 0.044, -0.004]}><cylinderGeometry args={[0.007, 0.007, 0.010, 8]} /><meshStandardMaterial color="#9CA3AF" metalness={0.85} roughness={0.15} {...MAT_OFFSET} /></mesh>
              <mesh position={[0, -0.044, -0.004]}><cylinderGeometry args={[0.007, 0.007, 0.010, 8]} /><meshStandardMaterial color="#9CA3AF" metalness={0.85} roughness={0.15} {...MAT_OFFSET} /></mesh>
            </group>
          </group>
        );
        if (isDouble) {
          const halfW = (doorW - gap) / 2;
          return <><ShakerDoor x={-(halfW / 2 + gap / 2)} w={halfW} handleSide="right" /><ShakerDoor x={(halfW / 2 + gap / 2)} w={halfW} handleSide="left" /></>;
        }
        return <ShakerDoor x={0} w={doorW} handleSide="right" />;
      })()}

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

      {/* ── Çekmece tutamaçları (kapak varsa gizle) ─── */}
      {!cab.hasDoor && handleYs.map((yPos, i) => (
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

      {/* ── Özel modül bölümleri — tüm variant'larda çalışır ──────────────── */}
      {cab.customSections && cab.customSections.length > 0 && (() => {
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

          // Bölme çizgisi (alta) — sürüklenebilir
          if (i < sections.length - 1) {
            const divIdx = i; // closure için
            elements.push(
              <group key={`cdiv${i}`}>
                {/* Görsel panel */}
                <mesh castShadow position={[0, botY, 0]}>
                  <boxGeometry args={[W - T * 2, T, D - T * 1.5]} />
                  <meshStandardMaterial color={color} metalness={mat.metalness} roughness={mat.roughness} />
                </mesh>
                {/* Sürükleme tutamaç alanı — daha geniş hit area */}
                <mesh
                  position={[0, botY, D / 2 + 0.005]}
                  onPointerDown={(e: any) => {
                    e.stopPropagation();
                    onInteractionStart();
                    (e.target as HTMLElement).setPointerCapture(e.pointerId);
                  }}
                  onPointerMove={(e: any) => {
                    if (!(e.target as HTMLElement).hasPointerCapture(e.pointerId)) return;
                    e.stopPropagation();
                    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -(cab.z + D / 2));
                    const hit = new THREE.Vector3();
                    e.ray.intersectPlane(plane, hit);
                    const newBotAbsY = hit.y; // world Y
                    const topAbsY = H / 2 - T; // top of sections area (world relative)
                    const fromTop = (topAbsY - newBotAbsY); // distance from top
                    const newTopH = Math.max(8, Math.round(fromTop / CM_TO_M / scale - sections.slice(0, divIdx).reduce((s, x) => s + x.heightCm, 0)));
                    const delta = newTopH - sections[divIdx].heightCm;
                    const nextH = Math.max(8, sections[divIdx + 1].heightCm - delta);
                    if (newTopH >= 8 && nextH >= 8) {
                      onSectionResize?.(cab.id, divIdx, newTopH, nextH);
                    }
                  }}
                  onPointerUp={(e: any) => {
                    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
                    onInteractionEnd();
                  }}
                >
                  <boxGeometry args={[W - T * 2, 0.022, 0.018]} />
                  <meshStandardMaterial color="#60A5FA" transparent opacity={0} />
                </mesh>
                {/* Görsel sürükleme ipucu — hover/seçili dolap */}
                {selected && (
                  <Html position={[-W / 2 - 0.04, botY, 0]} center distanceFactor={4} style={{ pointerEvents: "none" }}>
                    <div style={{ fontSize: 8, color: "#60A5FA", fontFamily: "system-ui", userSelect: "none" }}>↕</div>
                  </Html>
                )}
              </group>
            );
          }

          // Bölüm içeriği
          if (sec.type === "drawer" || sec.type === "deep-drawer") {
            // Çekmece yüzeyi + tutamaç
            const drawerColor = sec.type === "deep-drawer" ? shadeColor(color, -8) : shadeColor(color, +5);
            elements.push(
              <group key={`csec${i}`}>
                {/* Çekmece yüzü */}
                <mesh castShadow position={[0, secCenterY, D / 2 + 0.009]}>
                  <boxGeometry args={[W - T * 2.2, secH - 0.008, 0.016]} />
                  <meshStandardMaterial color={drawerColor} metalness={mat.metalness + 0.03} roughness={mat.roughness - 0.05} {...MAT_OFFSET} />
                </mesh>
                {/* Yatay tutamaç */}
                <mesh position={[0, secCenterY, D / 2 + 0.021]}>
                  <boxGeometry args={[W * 0.35, 0.010, 0.010]} />
                  <meshStandardMaterial color="#9CA3AF" metalness={0.88} roughness={0.12} {...MAT_OFFSET} />
                </mesh>
                <mesh position={[-W * 0.16, secCenterY - 0.018, D / 2 + 0.017]}>
                  <boxGeometry args={[0.009, 0.022, 0.009]} />
                  <meshStandardMaterial color="#6B7280" metalness={0.75} roughness={0.25} {...MAT_OFFSET} />
                </mesh>
                <mesh position={[W * 0.16, secCenterY - 0.018, D / 2 + 0.017]}>
                  <boxGeometry args={[0.009, 0.022, 0.009]} />
                  <meshStandardMaterial color="#6B7280" metalness={0.75} roughness={0.25} {...MAT_OFFSET} />
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
          } else if (sec.type === "jewelry-drawer") {
            // Takı çekmecesi — ince, mor aksan
            elements.push(
              <group key={`csec${i}`}>
                <mesh castShadow position={[0, secCenterY, D / 2 + 0.009]}>
                  <boxGeometry args={[W - T * 2.2, secH - 0.006, 0.014]} />
                  <meshStandardMaterial color={shadeColor(color, +12)} metalness={mat.metalness + 0.05} roughness={mat.roughness - 0.08} {...MAT_OFFSET} />
                </mesh>
                {/* Küçük yuvarlak kulp */}
                <mesh position={[0, secCenterY, D / 2 + 0.020]}>
                  <cylinderGeometry args={[0.012, 0.012, 0.008, 16]} />
                  <meshStandardMaterial color="#C084FC" metalness={0.9} roughness={0.1} {...MAT_OFFSET} />
                </mesh>
              </group>
            );
          } else if (sec.type === "shoe-rack") {
            // Ayakkabı rafı — eğik çubuklar
            const rodCount = Math.max(2, Math.floor((W - T * 2) / 0.08));
            for (let r = 0; r < Math.min(rodCount, 8); r++) {
              const rx = -(W - T * 2) / 2 + (r + 0.5) * ((W - T * 2) / rodCount);
              elements.push(
                <mesh key={`shoe${i}_${r}`} position={[rx, secCenterY, 0]} rotation={[0.3, 0, 0]}>
                  <cylinderGeometry args={[0.005, 0.005, D * 0.85, 8]} />
                  <meshStandardMaterial color="#818CF8" metalness={0.7} roughness={0.3} />
                </mesh>
              );
            }
          }
          // shelf & open: sadece bölme çizgisi yeterli

          // Boyut etiketi (sağda) + sürüklenebilir bölme çizgisi (alta)
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

      {/* ── Sürükleme tooltip (genişlik/yükseklik/derinlik cm) ────────────── */}
      {dragMeasure && (() => {
        const pos: [number,number,number] =
          dragMeasure.type === "height" ? [0, H / 2 + 0.06, D / 2 + 0.05] :
          dragMeasure.type === "depth"  ? [0, -H / 2 - 0.08, D / 2 + 0.05] :
          [W / 2 + 0.08, 0, D / 2 + 0.05];
        const color =
          dragMeasure.type === "height" ? "#2563EB" :
          dragMeasure.type === "depth"  ? "#10B981" : "#2563EB";
        const label =
          dragMeasure.type === "height" ? "↕ " :
          dragMeasure.type === "depth"  ? "◆ " : "↔ ";
        return (
          <Html position={pos} center distanceFactor={3} style={{ pointerEvents: "none" }}>
            <div style={{
              background: color, color: "white",
              borderRadius: 6, padding: "3px 8px",
              fontSize: 11, fontWeight: 700,
              fontFamily: "system-ui", whiteSpace: "nowrap",
              boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
            }}>
              {label}{dragMeasure.value} cm
            </div>
          </Html>
        );
      })()}
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
    doorStyle: "classic" as DoorStyle,
    lockedTo: null as number | null
  };
  if (variant === "drawerWardrobe") return { ...base, heightRatio: 0.82, widthFactor: 0.23, depthFactor: 0.22 };
  if (variant === "multiShelf")     return { ...base, heightRatio: 0.90, widthFactor: 0.12, depthFactor: 0.20 };
  if (variant === "custom")         return { ...base, heightRatio: 0.90, widthFactor: 0.23, depthFactor: 0.22, customSections: customSections ?? [] };
  return                                   { ...base, heightRatio: 0.90, widthFactor: 0.23, depthFactor: 0.22 };
}

// ─── Ürün Dene — Gerçek Ölçülü 3D Deneme ─────────────────────────────────────

type TryProduct = {
  id: string; name: string;
  w: number; h: number; d: number;
  icon: string; color: string;
  searchQuery: string; // Arama motoru sorgusu
};

const TRY_CATEGORIES: { id: string; label: string; icon: string; color: string }[] = [
  { id: "kitchen",  label: "Mutfak",        icon: "🍳", color: "#F97316" },
  { id: "shoe",     label: "Ayakkabılık",   icon: "👟", color: "#8B5CF6" },
  { id: "laundry",  label: "Çamaşır",       icon: "🫧", color: "#3B82F6" },
  { id: "living",   label: "Oturma",        icon: "🛋️", color: "#10B981" },
  { id: "bedroom",  label: "Yatak Odası",   icon: "🛏️", color: "#F59E0B" },
];

const TRY_PRODUCTS: Record<string, TryProduct[]> = {
  kitchen: [
    { id:"plate",     name:"Tabak (yemek)",      w:27,  h:3,  d:27,  icon:"🍽️", color:"#E5E7EB", searchQuery:"yemek tabağı 27cm" },
    { id:"plate_s",   name:"Tabak (çorba)",       w:22,  h:6,  d:22,  icon:"🥣", color:"#BFDBFE", searchQuery:"çorba tabağı 22cm" },
    { id:"mug",       name:"Kupa / Bardak",       w:9,   h:10, d:9,   icon:"☕", color:"#FDE68A", searchQuery:"kupa bardak seramik" },
    { id:"pot_sm",    name:"Tencere (orta 28cm)", w:28,  h:24, d:28,  icon:"🥘", color:"#C0C0C0", searchQuery:"tencere 28cm paslanmaz" },
    { id:"pot_lg",    name:"Tencere (büyük 36cm)",w:36,  h:28, d:36,  icon:"🫕", color:"#9CA3AF", searchQuery:"tencere 36cm büyük" },
    { id:"pan",       name:"Tava (30cm)",         w:30,  h:6,  d:30,  icon:"🍳", color:"#374151", searchQuery:"tava 30cm yapışmaz" },
    { id:"micro",     name:"Mikrodalga 49x30cm",  w:49,  h:30, d:36,  icon:"📺", color:"#374151", searchQuery:"mikrodalga fırın 20 litre" },
    { id:"coffee",    name:"Kahve Makinesi",      w:22,  h:35, d:28,  icon:"☕", color:"#78350F", searchQuery:"kahve makinesi espresso" },
    { id:"blender",   name:"Blender",             w:18,  h:45, d:18,  icon:"🥤", color:"#EF4444", searchQuery:"blender smoothie mutfak" },
    { id:"bowl_set",  name:"Kase Seti (6'lı)",    w:30,  h:15, d:30,  icon:"🍜", color:"#FEF3C7", searchQuery:"kase seti 6 parça" },
    { id:"spice",     name:"Baharat Kavanozu",    w:6,   h:12, d:6,   icon:"🧂", color:"#F9FAFB", searchQuery:"baharat kavanozu cam set" },
    { id:"cutlery",   name:"Çatal-Kaşık Seti",   w:20,  h:10, d:10,  icon:"🥄", color:"#D1D5DB", searchQuery:"çatal kaşık bıçak seti paslanmaz" },
    { id:"glass",     name:"Su Bardağı (6'lı)",   w:8,   h:12, d:8,   icon:"🥛", color:"#DBEAFE", searchQuery:"su bardağı 6lı set cam" },
    { id:"pot_press", name:"Düdüklü Tencere",     w:25,  h:22, d:25,  icon:"♨️", color:"#C0C0C0", searchQuery:"düdüklü tencere 6 litre" },
  ],
  shoe: [
    { id:"shoe_m",    name:"Spor Ayakkabı (42)",  w:32,  h:12, d:12,  icon:"👟", color:"#6B7280", searchQuery:"spor ayakkabı erkek 42 numara" },
    { id:"shoe_w",    name:"Bayan Ayakkabı (38)", w:28,  h:10, d:10,  icon:"👡", color:"#BE185D", searchQuery:"bayan ayakkabı 38 numara" },
    { id:"boot",      name:"Bot / Çizme",         w:32,  h:40, d:14,  icon:"👢", color:"#7C2D12", searchQuery:"bot çizme 38-42 numara" },
    { id:"heel",      name:"Topuklu (8cm)",       w:26,  h:20, d:10,  icon:"👠", color:"#BE185D", searchQuery:"topuklu ayakkabı 8cm topuk" },
    { id:"slipper",   name:"Terlik",              w:28,  h:5,  d:10,  icon:"🩴", color:"#FDE68A", searchQuery:"ev terliği yumuşak taban" },
    { id:"box_shoe",  name:"Ayakkabı Kutusu",     w:33,  h:13, d:20,  icon:"📦", color:"#FEF3C7", searchQuery:"şeffaf ayakkabı kutusu istiflenebilir" },
    { id:"shoebag",   name:"Ayakkabı Torbası",    w:35,  h:25, d:5,   icon:"👜", color:"#D97706", searchQuery:"ayakkabı saklama torbası beze" },
    { id:"kids_shoe", name:"Çocuk Ayakkabısı",    w:22,  h:9,  d:9,   icon:"👟", color:"#93C5FD", searchQuery:"çocuk spor ayakkabısı" },
    { id:"sneaker",   name:"Yüksek Bilekli (44)", w:34,  h:15, d:13,  icon:"👟", color:"#374151", searchQuery:"yüksek bilekli spor ayakkabı" },
    { id:"sandal",    name:"Sandalet",            w:27,  h:4,  d:10,  icon:"🩴", color:"#FCD34D", searchQuery:"sandalet yazlık ayakkabı" },
  ],
  laundry: [
    { id:"detergent", name:"Deterjan (5kg)",       w:22,  h:35, d:15,  icon:"🧴", color:"#60A5FA", searchQuery:"çamaşır deterjanı toz 5kg" },
    { id:"softener",  name:"Yumuşatıcı (2L)",      w:16,  h:28, d:12,  icon:"🌸", color:"#F9A8D4", searchQuery:"çamaşır yumuşatıcısı 2 litre" },
    { id:"iron",      name:"Ütü",                  w:30,  h:15, d:14,  icon:"🪄", color:"#818CF8", searchQuery:"buharlı ütü ev tipi" },
    { id:"basket",    name:"Çamaşır Sepeti",       w:45,  h:60, d:35,  icon:"🧺", color:"#FDE68A", searchQuery:"çamaşır sepeti büyük oval" },
    { id:"towel",     name:"Havlu (70x140cm)",     w:70,  h:2,  d:14,  icon:"🏳️", color:"#E0F2FE", searchQuery:"banyo havlusu 70x140 pamuk" },
    { id:"tp",        name:"Tuvalet Kağıdı (24'lü)",w:38, h:40, d:24,  icon:"🧻", color:"#F9FAFB", searchQuery:"tuvalet kağıdı 24lü paket" },
    { id:"cleaner",   name:"Genel Temizleyici",    w:10,  h:28, d:10,  icon:"🧹", color:"#A7F3D0", searchQuery:"çok amaçlı temizlik spreyi" },
    { id:"iron_board",name:"Ütü Masası",           w:120, h:90, d:35,  icon:"📋", color:"#D1D5DB", searchQuery:"ütü masası katlanabilir" },
    { id:"laundry_lg",name:"Büyük Çamaşır Sepeti", w:55, h:70, d:42,  icon:"🧺", color:"#FEF3C7", searchQuery:"büyük çamaşır sepeti bambu" },
    { id:"fabric_sof",name:"Kumaş Yumuşatıcı",    w:12,  h:22, d:12,  icon:"🧴", color:"#C7D2FE", searchQuery:"kumaş yumuşatıcı sprey" },
  ],
  living: [
    { id:"book",      name:"Kitap (standart)",     w:15,  h:22, d:3,   icon:"📚", color:"#92400E", searchQuery:"roman kitap bestseller" },
    { id:"book_set",  name:"Kitap Seti (10 adet)", w:25,  h:22, d:15,  icon:"📖", color:"#D97706", searchQuery:"kitap seti ciltli 10 parça" },
    { id:"vase",      name:"Vazo (orta 18cm)",     w:18,  h:30, d:18,  icon:"🏺", color:"#A78BFA", searchQuery:"dekoratif vazo cam seramik" },
    { id:"frame",     name:"Fotoğraf Çerçevesi",   w:20,  h:25, d:2,   icon:"🖼️", color:"#FEF3C7", searchQuery:"fotoğraf çerçevesi 13x18 ahşap" },
    { id:"candle",    name:"Mum / Dekor",           w:8,   h:15, d:8,   icon:"🕯️", color:"#FDE68A", searchQuery:"dekoratif mum koku ev" },
    { id:"plant",     name:"Saksı Bitki (orta)",   w:20,  h:35, d:20,  icon:"🌱", color:"#A7F3D0", searchQuery:"ev bitkisi saksı orta boy" },
    { id:"remote",    name:"Kumanda",              w:6,   h:18, d:3,   icon:"📱", color:"#374151", searchQuery:"universal tv kumanda" },
    { id:"clock",     name:"Masa Saati",           w:12,  h:18, d:8,   icon:"🕐", color:"#FDE68A", searchQuery:"masa saati dekoratif dijital" },
    { id:"speaker",   name:"Bluetooth Hoparlör",   w:18,  h:12, d:12,  icon:"🔊", color:"#374151", searchQuery:"bluetooth hoparlör taşınabilir" },
    { id:"lamp",      name:"Masa Lambası",         w:20,  h:45, d:20,  icon:"💡", color:"#FCD34D", searchQuery:"masa lambası led dokunmatik" },
  ],
  bedroom: [
    { id:"folded_s",  name:"Katlanmış Tişört",     w:25,  h:5,  d:30,  icon:"👕", color:"#BFDBFE", searchQuery:"erkek tişört pamuk basic" },
    { id:"folded_p",  name:"Pantolon (katlanmış)", w:35,  h:5,  d:25,  icon:"👖", color:"#6B7280", searchQuery:"pantolon chino slim fit" },
    { id:"sweater",   name:"Kazak (katlanmış)",    w:35,  h:8,  d:30,  icon:"🧥", color:"#D97706", searchQuery:"kazak triko örme kışlık" },
    { id:"bag",       name:"El Çantası",           w:32,  h:24, d:12,  icon:"👜", color:"#BE185D", searchQuery:"el çantası deri kadın" },
    { id:"box_s",     name:"Saklama Kutusu (S)",   w:30,  h:20, d:20,  icon:"📦", color:"#FEF3C7", searchQuery:"saklama kutusu kapaklı küçük" },
    { id:"box_l",     name:"Saklama Kutusu (L)",   w:60,  h:30, d:40,  icon:"🗃️", color:"#E5E7EB", searchQuery:"saklama kutusu büyük yatak altı" },
    { id:"pillow",    name:"Yastık (50x70cm)",     w:50,  h:15, d:70,  icon:"🛏️", color:"#F3F4F6", searchQuery:"uyku yastığı 50x70 sert yumuşak" },
    { id:"perfume",   name:"Parfüm Şişesi",        w:5,   h:12, d:5,   icon:"🌹", color:"#FEF3C7", searchQuery:"erkek kadın parfüm 100ml" },
    { id:"watch_box", name:"Saat Kutusu",          w:25,  h:8,  d:18,  icon:"⌚", color:"#D1D5DB", searchQuery:"saat kutusu düzenleyici" },
    { id:"jeans",     name:"Jean Pantolon",        w:35,  h:5,  d:25,  icon:"👖", color:"#1E40AF", searchQuery:"jean pantolon slim 32 beden" },
  ],
};

// ─── Onboarding Şablonları ────────────────────────────────────────────────────

type TemplateKey = "kitchen" | "wardrobe" | "laundry" | "tv" | "shoe" | "custom";

type OnboardingSection = {
  id: number;
  type: "shelf" | "drawer" | "hanger" | "open";
  heightCm: number;
};

const TEMPLATE_META: Record<TemplateKey, { name: string; sub: string }> = {
  kitchen:  { name: "Mutfak",        sub: "Üst raf + çekmece" },
  wardrobe: { name: "Gardırop",      sub: "Askı + raf + çekmece" },
  laundry:  { name: "Çamaşır Odası", sub: "Raflı + çekmeceli" },
  tv:       { name: "TV Ünitesi",    sub: "Alçak + orta raf" },
  shoe:     { name: "Ayakkabılık",   sub: "Eğik raflı" },
  custom:   { name: "Boş Başla",     sub: "Sıfırdan tasarla" },
};

const TEMPLATE_DEFAULT_SECTIONS: Record<TemplateKey, OnboardingSection[]> = {
  kitchen:  [
    { id:1, type:"shelf",  heightCm:35 },
    { id:2, type:"shelf",  heightCm:30 },
    { id:3, type:"drawer", heightCm:20 },
    { id:4, type:"drawer", heightCm:20 },
    { id:5, type:"drawer", heightCm:18 },
  ],
  wardrobe: [
    { id:1, type:"hanger", heightCm:115 },
    { id:2, type:"shelf",  heightCm:35 },
    { id:3, type:"shelf",  heightCm:35 },
    { id:4, type:"drawer", heightCm:20 },
  ],
  laundry:  [
    { id:1, type:"shelf",  heightCm:45 },
    { id:2, type:"shelf",  heightCm:45 },
    { id:3, type:"shelf",  heightCm:45 },
    { id:4, type:"drawer", heightCm:20 },
    { id:5, type:"open",   heightCm:40 },
  ],
  tv:       [
    { id:1, type:"open",   heightCm:45 },
    { id:2, type:"shelf",  heightCm:22 },
    { id:3, type:"drawer", heightCm:18 },
    { id:4, type:"shelf",  heightCm:22 },
  ],
  shoe:     [
    { id:1, type:"shelf",  heightCm:18 },
    { id:2, type:"shelf",  heightCm:18 },
    { id:3, type:"shelf",  heightCm:18 },
    { id:4, type:"shelf",  heightCm:18 },
    { id:5, type:"shelf",  heightCm:18 },
  ],
  custom: [],
};

/** Şablona + oda ölçülerine göre başlangıç Cabinet[] üretir */
function buildTemplateLayout(
  key: TemplateKey,
  room: RoomSize,
  sections: OnboardingSection[]
): Cabinet[] {
  const hr = Math.min(0.98, ((room.height - 5) / room.height));
  // Tek dolap — odanın tamamını kaplasın (max %80 genişlik)
  const wf = Math.min(0.70, (room.width * 0.8 * CM_TO_M) / (room.height * CM_TO_M * hr + 0.001));
  const df = Math.min(0.35, (room.depth * 0.6 * CM_TO_M) / (room.height * CM_TO_M * hr + 0.001));

  const customSects: CustomSection[] = sections.map(s => ({
    id: s.id, type: s.type as CustomSection["type"], heightCm: s.heightCm
  }));

  const baseVariant: CabinetVariant = "custom"; // Her zaman custom — iç düzenleyici bölümleri kullanır

  // Her zaman tek dolap — duvar dibine
  const cab = createCabinet(1, baseVariant, customSects.length > 0 ? customSects : undefined);
  return [{
    ...cab,
    id: 1,
    x: 0,
    z: -(room.depth * CM_TO_M) / 2 + (room.depth * CM_TO_M * df) / 2 + 0.05,
    heightRatio: hr,
    widthFactor: wf,
    depthFactor: df,
  }];
}

// ─── Ana Sayfa ────────────────────────────────────────────────────────────────

function ModuPlanApp() {
  // ── Onboarding ────────────────────────────────────────────────────────────
  const [showOnboarding, setShowOnboarding] = useState(true);
  const [obStep, setObStep] = useState<0|1|2|3|4>(0);
  const [obRoom, setObRoom] = useState<RoomSize>({ width: 320, depth: 280, height: 240 });
  const [obTemplate, setObTemplate] = useState<TemplateKey | null>(null);
  const [obSections, setObSections] = useState<OnboardingSection[]>([]);
  const [obMeasureMode, setObMeasureMode] = useState<"manual"|"camera">("manual");
  const obVideoRef = useRef<HTMLVideoElement | null>(null);
  const obStreamRef = useRef<MediaStream | null>(null);
  const [obCamActive, setObCamActive] = useState(false);
  const [obDragIdx, setObDragIdx] = useState<number | null>(null);
  // Oda planı — kuş bakışı eşya yerleştirme
  type RoomFurniture = {
    id: number; type: string; rx: number; ry: number; w: number; h: number;
  };
  const [obFurniture, setObFurniture] = useState<RoomFurniture[]>([]);
  const [obSelFurn, setObSelFurn] = useState<string | null>(null);
  const obCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const obDragFurnRef = useRef<{ item: RoomFurniture; offX: number; offY: number } | null>(null);
  const obResizeRef = useRef<{ item: RoomFurniture; handle: string; sx: number; sy: number; ow: number; oh: number; orx: number; ory: number } | null>(null);
  const [obHoverFurnId, setObHoverFurnId] = useState<number | null>(null);
  const [obScanActive, setObScanActive] = useState(false);

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

  // ── Ürün Dene state ──────────────────────────────────────────────────────
  const [tryCategory, setTryCategory] = useState<string>("kitchen");
  const [tryProductId, setTryProductId] = useState<string | null>(null);
  const [showProductPanel, setShowProductPanel] = useState(false);
  const [showBuyLinks, setShowBuyLinks] = useState(false);
  // Sahnede konumlanmış ürün
  const [placedProduct, setPlacedProduct] = useState<{
    product: TryProduct;
    pos: [number, number, number];
    rotated: boolean; // düşey (true) = w↔h yer değiştirir — askılıkta pantolon uzunlamasına
  } | null>(null);
  // Aktif sürükleme ekseni — panelden seçilir, 3D içinde kullanılır
  const [productAxis, setProductAxis] = useState<"xz" | "y">("xz");
  const productDragging = React.useRef(false);

  const tryProduct = tryProductId
    ? TRY_PRODUCTS[tryCategory]?.find(p => p.id === tryProductId) ?? null
    : null;

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
  const [cabPanelTab, setCabPanelTab] = useState<"dims"|"interior"|"style">("dims");
  const [customSections, setCustomSections] = useState<CustomSection[]>([
    { id: 1, type: "hanger", heightCm: 120 },
    { id: 2, type: "shelf",  heightCm: 40 },
  ]);
  const nextSecId = React.useRef(10);

  // ── Dolap yönetimi ───────────────────────────────────────────────────────

  const addCabinet = (variant: CabinetVariant) => {
    const id = cabinets.length ? Math.max(...cabinets.map(c => c.id)) + 1 : 1;
    const hr = Math.min(0.98, (room.height - 5) / room.height);
    const wf = Math.min(0.50, (room.width * 0.6 * CM_TO_M) / (room.height * CM_TO_M * hr + 0.001));
    const df = Math.min(0.30, (room.depth * 0.5 * CM_TO_M) / (room.height * CM_TO_M * hr + 0.001));
    const zBack = -(room.depth * CM_TO_M) / 2 + (room.depth * CM_TO_M * df) / 2 + 0.05;
    const base = createCabinet(id, "custom", [
      { id: Date.now(), type: "hanger", heightCm: Math.round(room.height * hr * 0.55) },
      { id: Date.now() + 1, type: "shelf", heightCm: Math.round(room.height * hr * 0.25) },
      { id: Date.now() + 2, type: "drawer", heightCm: Math.round(room.height * hr * 0.20) },
    ]);
    setCabinets(prev => [...prev, { ...base, id, x: 0, z: zBack, heightRatio: hr, widthFactor: wf, depthFactor: df }]);
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

  const updateCabinetDepthFactor = (id: number, depthFactor: number) =>
    setCabinets(prev => prev.map(c => c.id === id ? { ...c, depthFactor } : c));

  const [dragMeasure, setDragMeasure] = useState<{ cabId: number; value: string; type: "width" | "height" | "depth" } | null>(null);
  const dragMeasureTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleDragMeasureHide = () => {
    if (dragMeasureTimeoutRef.current) clearTimeout(dragMeasureTimeoutRef.current);
    dragMeasureTimeoutRef.current = setTimeout(() => {
      setDragMeasure(null);
      dragMeasureTimeoutRef.current = null;
    }, 1500);
  };
  const handleWidthDragValue  = (cabId: number, value: string) => setDragMeasure({ cabId, value, type: "width" });
  const handleHeightDragValue = (cabId: number, value: string) => setDragMeasure({ cabId, value, type: "height" });
  const handleDepthDragValue  = (cabId: number, value: string) => setDragMeasure({ cabId, value, type: "depth" });
  const handleWidthDragEnd  = () => scheduleDragMeasureHide();
  const handleHeightDragEnd = () => scheduleDragMeasureHide();
  const handleDepthDragEnd  = () => scheduleDragMeasureHide();

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
  const updateSelectedDepthCm = (val: string) => {
    if (selectedId == null || !selectedCab) return;
    const num = parseInt(val, 10);
    if (Number.isNaN(num) || num < 20 || num > 120) return;
    const heightCm = room.height * selectedCab.heightRatio;
    setCabinets(prev => prev.map(c =>
      c.id === selectedId ? { ...c, depthFactor: num / heightCm } : c
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

    // Zaten kilitliyse → kilidi aç
    if (selectedCab.lockedTo != null) {
      const partnerId = selectedCab.lockedTo;
      setCabinets(prev => prev.map(c => {
        if (c.id === selectedId) return { ...c, lockedTo: null };
        if (c.id === partnerId) return { ...c, lockedTo: null };
        return c;
      }));
      return;
    }

    // Kilitle — en yakın komşuya yapıştır
    const others = cabinets.filter(c => c.id !== selectedId);
    if (others.length === 0) return;
    const halfW = (selectedCab.widthFactor * room.height * selectedCab.heightRatio * CM_TO_M) / 2;
    const halfD = (selectedCab.depthFactor * room.height * selectedCab.heightRatio * CM_TO_M) / 2;
    let nearest: { id: number; dist: number } | null = null;
    for (const o of others) {
      const dist = Math.hypot(selectedCab.x - o.x, selectedCab.z - o.z);
      if (dist < (nearest?.dist ?? Infinity)) nearest = { id: o.id, dist };
    }
    if (!nearest) return;
    const other = cabinets.find(c => c.id === nearest!.id)!;
    let dx = other.x - selectedCab.x;
    let dz = other.z - selectedCab.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.01) return;
    dx /= dist; dz /= dist;
    const ow = (other.widthFactor * room.height * other.heightRatio * CM_TO_M) / 2;
    const od = (other.depthFactor * room.height * other.heightRatio * CM_TO_M) / 2;
    const snapX = snapToGrid(other.x - dx * (halfW + ow));
    const snapZ = snapToGrid(other.z - dz * (halfD + od));
    setCabinets(prev => prev.map(c => {
      if (c.id === selectedId) return { ...c, x: snapX, z: snapZ, lockedTo: nearest!.id };
      if (c.id === nearest!.id) return { ...c, lockedTo: selectedId };
      return c;
    }));
  };

  // ── Onboarding handlers ──────────────────────────────────────────────────

  const obStartCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      obStreamRef.current = stream;
      if (obVideoRef.current) obVideoRef.current.srcObject = stream;
      setObCamActive(true);
      setObMeasureMode("camera");
    } catch {
      alert("Kamera erişimi sağlanamadı. Manuel giriş kullanın.");
    }
  };

  const obStopCamera = () => {
    obStreamRef.current?.getTracks().forEach(t => t.stop());
    obStreamRef.current = null;
    setObCamActive(false);
  };

  const obPickTemplate = (key: TemplateKey) => {
    setObTemplate(key);
    setObSections(TEMPLATE_DEFAULT_SECTIONS[key].map((s, i) => ({ ...s, id: i + 1 })));
  };

  const obAddSection = (type: OnboardingSection["type"]) => {
    const defaults = { shelf: 35, drawer: 20, hanger: 115, open: 40 };
    setObSections(prev => [...prev, { id: Date.now(), type, heightCm: defaults[type] }]);
  };

  const obDeleteSection = (id: number) => {
    setObSections(prev => prev.filter(s => s.id !== id));
  };

  const obDragStart = (idx: number) => setObDragIdx(idx);

  const obDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (obDragIdx === null || obDragIdx === idx) return;
    setObSections(prev => {
      const next = [...prev];
      const [moved] = next.splice(obDragIdx, 1);
      next.splice(idx, 0, moved);
      setObDragIdx(idx);
      return next;
    });
  };

  // ── Akıllı dolap yerleşim algoritması ───────────────────────────────────
  const findBestWallPlacement = (room: RoomSize, furniture: typeof obFurniture) => {
    const RW = room.width, RD = room.depth;
    const DEPTH_CM = Math.min(65, room.depth * 0.22); // Dolap derinliği max %22 oda derinliği

    // 4 duvarı analiz et: arka(N), sol(W), sağ(E), ön(S)
    // Her duvar için: o duvara bitişik eşyaların kapladığı aralıkları bul
    const walls = [
      { id: "N", axis: "x" as const, fixedVal: 0,  range: [0, RW], wallZ: 0,         wallX: RW/2 },
      { id: "S", axis: "x" as const, fixedVal: RD, range: [0, RW], wallZ: RD,        wallX: RW/2 },
      { id: "W", axis: "y" as const, fixedVal: 0,  range: [0, RD], wallZ: RD/2,      wallX: 0    },
      { id: "E", axis: "y" as const, fixedVal: RW, range: [0, RD], wallZ: RD/2,      wallX: RW   },
    ];

    let bestWall = walls[0]; // default: arka duvar
    let bestFreeLen = 0;
    let bestCenter = RW / 2;

    for (const wall of walls) {
      // Bu duvara yakın (<50cm) eşyaları bul
      const occupied: [number, number][] = [];
      furniture.forEach(f => {
        const def = OB_FURN_DEFS[f.type];
        if (!def || f.type === "cab-mark") return;
        let near = false;
        let start = 0, end = 0;
        if (wall.id === "N") { near = f.ry < 50; start = f.rx; end = f.rx + f.w; }
        if (wall.id === "S") { near = (f.ry + f.h) > RD - 50; start = f.rx; end = f.rx + f.w; }
        if (wall.id === "W") { near = f.rx < 50; start = f.ry; end = f.ry + f.h; }
        if (wall.id === "E") { near = (f.rx + f.w) > RW - 50; start = f.ry; end = f.ry + f.h; }
        if (near) occupied.push([start, end]);
      });
      // Boşlukları bul
      const sorted = [...occupied].sort((a, b) => a[0] - b[0]);
      const rangeEnd = wall.id === "N" || wall.id === "S" ? RW : RD;
      let pos = 0;
      let maxFree = 0, maxCenter = rangeEnd / 2;
      for (const [s, e] of sorted) {
        if (s - pos > maxFree) { maxFree = s - pos; maxCenter = (pos + s) / 2; }
        pos = Math.max(pos, e);
      }
      if (rangeEnd - pos > maxFree) { maxFree = rangeEnd - pos; maxCenter = (pos + rangeEnd) / 2; }
      if (maxFree > bestFreeLen) { bestFreeLen = maxFree; bestWall = wall; bestCenter = maxCenter; }
    }

    // Dolap boyutlarını en iyi boşluğa göre ayarla
    const hr = Math.min(0.98, (room.height - 5) / room.height);
    const heightCm = room.height * hr;
    const cabWidth = Math.min(bestFreeLen * 0.9, room.width * 0.85);
    const wf = cabWidth / heightCm;
    const df = DEPTH_CM / heightCm;

    // 3D pozisyon (room merkezinden)
    let x3d = 0, z3d = 0;
    const halfW = room.width * CM_TO_M / 2;
    const halfD = room.depth * CM_TO_M / 2;
    const cabDepthM = DEPTH_CM * CM_TO_M;

    if (bestWall.id === "N") { x3d = (bestCenter - RW/2) * CM_TO_M; z3d = -halfD + cabDepthM/2 + 0.02; }
    if (bestWall.id === "S") { x3d = (bestCenter - RW/2) * CM_TO_M; z3d =  halfD - cabDepthM/2 - 0.02; }
    if (bestWall.id === "W") { x3d = -halfW + cabDepthM/2 + 0.02; z3d = (bestCenter - RD/2) * CM_TO_M; }
    if (bestWall.id === "E") { x3d =  halfW - cabDepthM/2 - 0.02; z3d = (bestCenter - RD/2) * CM_TO_M; }

    const rotation = (bestWall.id === "W" || bestWall.id === "E") ? Math.PI / 2 : 0;

    return { x: x3d, z: z3d, wf, df, hr, rotation, wallId: bestWall.id, freeLen: bestFreeLen };
  };

  const obFinish = () => {
    obStopCamera();
    const newRoom = obRoom;

    // Boş alan analizi ile en iyi duvara otomatik yerleştir
    const placement = findBestWallPlacement(newRoom, obFurniture);

    const hr = placement.hr;
    const customSects: CustomSection[] = obSections.map(s => ({
      id: s.id, type: s.type as CustomSection["type"], heightCm: s.heightCm
    }));

    const defaultSections: CustomSection[] = obTemplate === "wardrobe" ? [
      { id: 1, type: "hanger", heightCm: Math.round(newRoom.height * hr * 0.50) },
      { id: 2, type: "shelf",  heightCm: Math.round(newRoom.height * hr * 0.25) },
      { id: 3, type: "drawer", heightCm: Math.round(newRoom.height * hr * 0.25) },
    ] : obTemplate === "kitchen" ? [
      { id: 1, type: "shelf",  heightCm: Math.round(newRoom.height * hr * 0.35) },
      { id: 2, type: "shelf",  heightCm: Math.round(newRoom.height * hr * 0.30) },
      { id: 3, type: "drawer", heightCm: Math.round(newRoom.height * hr * 0.18) },
      { id: 4, type: "drawer", heightCm: Math.round(newRoom.height * hr * 0.17) },
    ] : obTemplate === "shoe" ? [
      { id: 1, type: "shoe-rack", heightCm: Math.round(newRoom.height * hr * 0.25) },
      { id: 2, type: "shoe-rack", heightCm: Math.round(newRoom.height * hr * 0.25) },
      { id: 3, type: "shelf",     heightCm: Math.round(newRoom.height * hr * 0.25) },
      { id: 4, type: "open",      heightCm: Math.round(newRoom.height * hr * 0.25) },
    ] : [
      { id: 1, type: "hanger", heightCm: Math.round(newRoom.height * hr * 0.55) },
      { id: 2, type: "shelf",  heightCm: Math.round(newRoom.height * hr * 0.25) },
      { id: 3, type: "drawer", heightCm: Math.round(newRoom.height * hr * 0.20) },
    ];

    const sections = customSects.length > 0 ? customSects : defaultSections;
    const base = createCabinet(1, "custom", sections);

    const layout: Cabinet[] = [{
      ...base,
      id: 1,
      x: placement.x,
      z: placement.z,
      heightRatio: placement.hr,
      widthFactor: placement.wf,
      depthFactor: placement.df,
      rotation: placement.rotation,
    }];

    setRoom(newRoom);
    setCabinets(layout);
    setSelectedId(1);
    setShowOnboarding(false);
  };

  // ── Oda Planı Canvas ─────────────────────────────────────────────────────
  const OB_FURN_DEFS: Record<string, { w: number; h: number; color: string; border: string; label: string; fixed: boolean }> = {
    sofa:      { w:200, h:85,  color:"#FAC775", border:"#BA7517", label:"Koltuk",      fixed:false },
    bed:       { w:140, h:200, color:"#FAC775", border:"#BA7517", label:"Yatak",       fixed:false },
    table:     { w:120, h:80,  color:"#FAC775", border:"#BA7517", label:"Masa",        fixed:false },
    piano:     { w:150, h:55,  color:"#FAC775", border:"#BA7517", label:"Piyano",      fixed:false },
    "cab-mark":{ w:200, h:60,  color:"#B5D4F4", border:"#185FA5", label:"Dolap Alanı", fixed:false },
    fridge:    { w:60,  h:65,  color:"#D3D1C7", border:"#888780", label:"Buzdolabı",   fixed:true },
    washer:    { w:60,  h:58,  color:"#D3D1C7", border:"#888780", label:"Çamaşır",     fixed:true },
    dryer:     { w:60,  h:60,  color:"#D3D1C7", border:"#888780", label:"Kurutucu",    fixed:true },
    dishwasher:{ w:60,  h:60,  color:"#D3D1C7", border:"#888780", label:"Bulaşık",     fixed:true },
    oven:      { w:60,  h:60,  color:"#D3D1C7", border:"#888780", label:"Fırın/Ocak",  fixed:true },
  };
  const HS = 8; // handle size

  const obDrawCanvas = React.useCallback(() => {
    const canvas = obCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const cw = canvas.width, ch = canvas.height;
    const RW = obRoom.width, RD = obRoom.depth;
    const padX = 16, padY = 12;
    const sc = (cw - padX * 2) / RW;
    ctx.clearRect(0, 0, cw, ch);
    // Room bg
    ctx.fillStyle = "#EAF3DE"; ctx.strokeStyle = "#639922"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect(padX, padY, RW * sc, RD * sc, 3); ctx.fill(); ctx.stroke();
    // Grid
    ctx.strokeStyle = "rgba(99,153,34,0.1)"; ctx.lineWidth = 0.5;
    for (let x = 50; x < RW; x += 50) { const cx = padX + x * sc; ctx.beginPath(); ctx.moveTo(cx, padY); ctx.lineTo(cx, padY + RD * sc); ctx.stroke(); }
    for (let y = 50; y < RD; y += 50) { const cy = padY + y * sc; ctx.beginPath(); ctx.moveTo(padX, cy); ctx.lineTo(padX + RW * sc, cy); ctx.stroke(); }
    ctx.fillStyle = "#3B6D11"; ctx.font = "10px system-ui"; ctx.textAlign = "left"; ctx.textBaseline = "top";
    ctx.fillText(`${RW}×${RD} cm`, padX + 4, padY + 4);
    // Furniture
    obFurniture.forEach(item => {
      const def = OB_FURN_DEFS[item.type];
      if (!def) return;
      const x = padX + item.rx * sc, y = padY + item.ry * sc;
      const w = item.w * sc, h = item.h * sc;
      const isHov = item.id === obHoverFurnId;
      ctx.fillStyle = "rgba(0,0,0,0.06)";
      ctx.beginPath(); ctx.roundRect(x + 2, y + 2, w, h, 3); ctx.fill();
      ctx.fillStyle = def.color; ctx.strokeStyle = def.border; ctx.lineWidth = isHov ? 2 : 0.8;
      ctx.beginPath(); ctx.roundRect(x, y, w, h, 3); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#444441"; ctx.font = "500 10px system-ui"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(def.label, x + w / 2, y + h / 2 - 5);
      ctx.fillStyle = "#888780"; ctx.font = "9px system-ui";
      ctx.fillText(`${Math.round(item.w)}×${Math.round(item.h)} cm`, x + w / 2, y + h / 2 + 6);
      if (isHov && !def.fixed) {
        // Resize handles
        const handles = [
          { id:"tl", cx:x,     cy:y      }, { id:"tr", cx:x+w,   cy:y     },
          { id:"br", cx:x+w,   cy:y+h    }, { id:"bl", cx:x,     cy:y+h   },
          { id:"tm", cx:x+w/2, cy:y      }, { id:"bm", cx:x+w/2, cy:y+h   },
          { id:"ml", cx:x,     cy:y+h/2  }, { id:"mr", cx:x+w,   cy:y+h/2 },
        ];
        handles.forEach(hnd => {
          ctx.fillStyle = "white"; ctx.strokeStyle = "#BA7517"; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.roundRect(hnd.cx - HS/2, hnd.cy - HS/2, HS, HS, 2); ctx.fill(); ctx.stroke();
        });
        ctx.fillStyle = "rgba(186,117,23,0.9)";
        const badge = "↔ boyutu değiştir";
        ctx.font = "9px system-ui"; const bw = ctx.measureText(badge).width + 10;
        ctx.beginPath(); ctx.roundRect(x + w/2 - bw/2, y - 18, bw, 14, 4); ctx.fill();
        ctx.fillStyle = "white"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(badge, x + w/2, y - 11);
      }
      if (isHov && def.fixed) {
        ctx.fillStyle = "rgba(95,94,90,0.85)";
        const badge = "Standart ölçü";
        ctx.font = "9px system-ui"; const bw = ctx.measureText(badge).width + 10;
        ctx.beginPath(); ctx.roundRect(x + w/2 - bw/2, y - 18, bw, 14, 4); ctx.fill();
        ctx.fillStyle = "white"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(badge, x + w/2, y - 11);
      }
    });
    // Ghost if placing
    if (obSelFurn) {
      const def = OB_FURN_DEFS[obSelFurn];
      if (def) {
        ctx.fillStyle = "rgba(55,138,221,0.15)"; ctx.strokeStyle = "#185FA5"; ctx.lineWidth = 1;
        ctx.setLineDash([4, 3]);
        ctx.beginPath(); ctx.roundRect(padX + 8, padY + 8, def.w * sc, def.h * sc, 3); ctx.fill(); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = "#185FA5"; ctx.font = "500 10px system-ui"; ctx.textAlign = "left"; ctx.textBaseline = "top";
        ctx.fillText("Tıkla → yerleştir", padX + 12, padY + 12);
      }
    }
  }, [obFurniture, obSelFurn, obHoverFurnId, obRoom]);

  useEffect(() => { obDrawCanvas(); }, [obDrawCanvas]);

  const obGetCanvasPos = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = obCanvasRef.current; if (!canvas) return { cx: 0, cy: 0, sc: 1, padX: 16, padY: 12 };
    const rect = canvas.getBoundingClientRect();
    const cl = "touches" in e ? (e as React.TouchEvent).touches[0].clientX : (e as React.MouseEvent).clientX;
    const ct = "touches" in e ? (e as React.TouchEvent).touches[0].clientY : (e as React.MouseEvent).clientY;
    const sc = (canvas.width - 32) / obRoom.width;
    return { cx: cl - rect.left, cy: ct - rect.top, sc, padX: 16, padY: 12 };
  };

  const obHitHandle = (item: { rx: number; ry: number; w: number; h: number }, cx: number, cy: number, sc: number, padX: number, padY: number) => {
    const x = padX + item.rx * sc, y = padY + item.ry * sc, w = item.w * sc, h = item.h * sc;
    const handles = [
      { id:"tl", cx:x, cy:y }, { id:"tr", cx:x+w, cy:y }, { id:"br", cx:x+w, cy:y+h }, { id:"bl", cx:x, cy:y+h },
      { id:"tm", cx:x+w/2, cy:y }, { id:"bm", cx:x+w/2, cy:y+h }, { id:"ml", cx:x, cy:y+h/2 }, { id:"mr", cx:x+w, cy:y+h/2 },
    ];
    return handles.find(h => Math.abs(cx - h.cx) <= HS + 2 && Math.abs(cy - h.cy) <= HS + 2) ?? null;
  };

  const obHitItem = (cx: number, cy: number, sc: number, padX: number, padY: number) => {
    for (let i = obFurniture.length - 1; i >= 0; i--) {
      const it = obFurniture[i];
      const x = padX + it.rx * sc, y = padY + it.ry * sc;
      if (cx >= x && cx <= x + it.w * sc && cy >= y && cy <= y + it.h * sc) return it;
    }
    return null;
  };

  const obCanvasPointerDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const { cx, cy, sc, padX, padY } = obGetCanvasPos(e);
    const RW = obRoom.width, RD = obRoom.depth;
    if (obSelFurn) {
      const def = OB_FURN_DEFS[obSelFurn]; if (!def) return;
      let rx = (cx - padX) / sc - def.w / 2, ry = (cy - padY) / sc - def.h / 2;
      rx = Math.max(0, Math.min(RW - def.w, rx)); ry = Math.max(0, Math.min(RD - def.h, ry));
      const newItem = { id: Date.now(), type: obSelFurn, rx, ry, w: def.w, h: def.h };
      setObFurniture(prev => [...prev, newItem]);
      setObSelFurn(null); return;
    }
    const hit = obHitItem(cx, cy, sc, padX, padY);
    if (hit) {
      const def = OB_FURN_DEFS[hit.type];
      if (def && !def.fixed) {
        const hnd = obHitHandle(hit, cx, cy, sc, padX, padY);
        if (hnd) {
          obResizeRef.current = { item: hit, handle: hnd.id, sx: cx, sy: cy, ow: hit.w, oh: hit.h, orx: hit.rx, ory: hit.ry };
          return;
        }
      }
      obDragFurnRef.current = { item: hit, offX: cx - (padX + hit.rx * sc), offY: cy - (padY + hit.ry * sc) };
      // bring to front
      setObFurniture(prev => { const next = prev.filter(f => f.id !== hit.id); return [...next, hit]; });
    }
  };

  const obCanvasPointerMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const { cx, cy, sc, padX, padY } = obGetCanvasPos(e);
    const RW = obRoom.width, RD = obRoom.depth;
    if (obResizeRef.current) {
      const { item, handle, sx, sy, ow, oh, orx, ory } = obResizeRef.current;
      const dx = (cx - sx) / sc, dy = (cy - sy) / sc;
      let nw = ow, nh = oh, nx = orx, ny = ory;
      if (handle.includes("r") || handle === "mr") nw = Math.max(30, ow + dx);
      if (handle.includes("l") || handle === "ml") { nw = Math.max(30, ow - dx); nx = orx + ow - nw; }
      if (handle.includes("b") || handle === "bm") nh = Math.max(30, oh + dy);
      if (handle.includes("t") || handle === "tm") { nh = Math.max(30, oh - dy); ny = ory + oh - nh; }
      setObFurniture(prev => prev.map(f => f.id === item.id
        ? { ...f, rx: Math.max(0, Math.min(RW - nw, nx)), ry: Math.max(0, Math.min(RD - nh, ny)), w: nw, h: nh }
        : f));
      return;
    }
    if (obDragFurnRef.current) {
      const { item, offX, offY } = obDragFurnRef.current;
      const def = OB_FURN_DEFS[item.type];
      if (!def) return;
      const rx = Math.max(0, Math.min(RW - item.w, (cx - offX - padX) / sc));
      const ry = Math.max(0, Math.min(RD - item.h, (cy - offY - padY) / sc));
      setObFurniture(prev => prev.map(f => f.id === item.id ? { ...f, rx, ry } : f));
      return;
    }
    const hit = obHitItem(cx, cy, sc, padX, padY);
    setObHoverFurnId(hit ? hit.id : null);
  };

  const obCanvasPointerUp = () => {
    obDragFurnRef.current = null;
    obResizeRef.current = null;
  };

  const obSimulateScan = () => {
    setObScanActive(true);
    setTimeout(() => {
      const RW = obRoom.width, RD = obRoom.depth;
      setObFurniture([
        { id: 1, type: "sofa",     rx: 20,       ry: 20,       w: 180, h: 80 },
        { id: 2, type: "table",    rx: 80,        ry: 180,      w: 100, h: 70 },
        { id: 3, type: "cab-mark", rx: 10,        ry: RD - 70,  w: Math.min(200, RW - 20), h: 60 },
      ]);
      setObScanActive(false);
      setObMeasureMode("manual");
    }, 1800);
  };

  const obFurnStats = () => {
    const total = (obRoom.width * obRoom.depth) / 10000;
    const used = obFurniture.reduce((s, f) => s + (f.w * f.h) / 10000, 0);
    return { total: total.toFixed(2), used: used.toFixed(2), free: Math.max(0, total - used).toFixed(2) };
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

  // ── Onboarding UI bileşenleri ────────────────────────────────────────────
  const OB_STEP_LABELS = ["Alan Ölçüsü", "Mevcut Eşyalar", "Şablon Seç", "İç Düzen", "Hazır"];
  const OB_TYPE_ICONS: Record<string, string> = { shelf:"Raf", drawer:"Çekmece", hanger:"Askılık", open:"Açık" };

  const obRenderOnboarding = () => {
    const stats = obFurnStats();
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md max-h-[92vh] overflow-hidden flex flex-col">

          {/* Header */}
          <div className="px-6 pt-5 pb-3 border-b border-slate-100">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-xl bg-primary/10 flex items-center justify-center">
                  <span className="text-primary font-bold text-xs">M</span>
                </div>
                <span className="font-semibold text-slate-800 text-sm">ModuPlan</span>
              </div>
              <span className="text-xs text-slate-400">{obStep + 1} / {OB_STEP_LABELS.length}</span>
            </div>
            <div className="flex gap-1.5">
              {OB_STEP_LABELS.map((_, i) => (
                <div key={i} className={`h-1.5 rounded-full transition-all duration-300 ${i === obStep ? "flex-[2] bg-primary" : i < obStep ? "flex-1 bg-primary/40" : "flex-1 bg-slate-200"}`} />
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

            {/* Step 0: Ölçüm */}
            {obStep === 0 && (
              <>
                <div>
                  <div className="text-base font-semibold text-slate-800 mb-1">Alanı ölçelim</div>
                  <div className="text-xs text-slate-500 leading-relaxed">Mobilya otomatik olarak girdiğiniz yüksekliğe tam sığacak şekilde yerleşir. Sonrasında 3D editörde kenarlardan tutarak değiştirebilirsiniz.</div>
                </div>
                <button onClick={() => { setObMeasureMode("camera"); obStartCamera(); }}
                  className={`w-full border rounded-xl py-4 flex flex-col items-center gap-1.5 transition ${obMeasureMode === "camera" ? "border-primary bg-primary/5" : "border-slate-200 hover:border-primary/50"}`}>
                  <svg width="20" height="20" fill="none" stroke={obMeasureMode === "camera" ? "#2563EB" : "#94a3b8"} strokeWidth="1.6" viewBox="0 0 24 24"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>
                  <span className="text-sm font-medium text-slate-700">Kamera ile ölç</span>
                  <span className="text-xs text-slate-400">Telefonu duvara doğrult</span>
                </button>
                <div className="flex items-center gap-3"><div className="flex-1 h-px bg-slate-100"/><span className="text-xs text-slate-400">veya manuel gir</span><div className="flex-1 h-px bg-slate-100"/></div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-slate-500 block mb-1">Genişlik (cm)</label>
                    <input type="number" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary" placeholder="320"
                      value={obRoom.width || ""} onChange={e => setObRoom(prev => ({ ...prev, width: parseInt(e.target.value) || 320 }))} />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 block mb-1">Derinlik (cm)</label>
                    <input type="number" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary" placeholder="280"
                      value={obRoom.depth || ""} onChange={e => setObRoom(prev => ({ ...prev, depth: parseInt(e.target.value) || 280 }))} />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-slate-500 block mb-1">
                    Tavan yüksekliği (cm)
                    <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-medium">mobilya buna göre boyutlanır</span>
                  </label>
                  <input type="number" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary" placeholder="240"
                    value={obRoom.height || ""} onChange={e => setObRoom(prev => ({ ...prev, height: parseInt(e.target.value) || 240 }))} />
                  {obRoom.height > 0 && (
                    <p className="mt-1.5 text-xs text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2">
                      Mobilya {obRoom.height} cm yüksekliğe otomatik yerleşir.
                    </p>
                  )}
                </div>
              </>
            )}

            {/* Step 1: Oda Planı */}
            {obStep === 1 && (
              <>
                <div>
                  <div className="text-base font-semibold text-slate-800 mb-1">Odadaki mevcut eşyaları ekle</div>
                  <div className="text-xs text-slate-500 leading-relaxed">
                    Koltuk, yatak, beyaz eşya varsa yerleştir. ModuPlan boş alanı otomatik algılayıp dolabı en uygun duvara yerleştirecek.
                  </div>
                </div>
                {/* Boşluk analiz çubuğu */}
                <div className="bg-slate-50 rounded-xl p-3 space-y-2">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-500">Alan doluluk oranı</span>
                    <span className="font-semibold text-slate-700">{stats.used} / {stats.total} m²</span>
                  </div>
                  <div className="w-full bg-slate-200 rounded-full h-2">
                    <div className="bg-emerald-500 h-2 rounded-full transition-all" style={{ width: `${Math.min(100, (parseFloat(stats.used) / parseFloat(stats.total)) * 100)}%` }} />
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] text-emerald-700 bg-emerald-50 rounded-lg px-2 py-1">
                    <svg width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
                    {parseFloat(stats.free) > 0
                      ? `${stats.free} m² boş alan tespit edildi — dolap otomatik konumlanacak`
                      : "Eşya ekleyince boş alan analizi yapılacak"}
                  </div>
                </div>
                <div className="flex border border-slate-200 rounded-xl overflow-hidden">
                  <button onClick={() => { setObMeasureMode("camera"); obSimulateScan(); }}
                    className={`flex-1 py-2 text-xs font-medium transition ${obMeasureMode === "camera" ? "bg-primary text-white" : "text-slate-500 hover:bg-slate-50"}`}>
                    Kamera ile tara
                  </button>
                  <button onClick={() => setObMeasureMode("manual")}
                    className={`flex-1 py-2 text-xs font-medium transition ${obMeasureMode === "manual" ? "bg-primary text-white" : "text-slate-500 hover:bg-slate-50"}`}>
                    Manuel yerleştir
                  </button>
                </div>
                <div>
                  <div className="text-[11px] text-amber-700 font-medium mb-2">Mobilya — köşeden boyutu değiştirilebilir:</div>
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {["sofa","bed","table","piano","cab-mark"].map(type => (
                      <button key={type} onClick={() => setObSelFurn(obSelFurn === type ? null : type)}
                        className={`text-xs px-2.5 py-1.5 rounded-lg border transition ${obSelFurn === type ? "border-amber-400 bg-amber-50 text-amber-800" : type === "cab-mark" ? "border-blue-300 bg-blue-50 text-blue-700 hover:border-blue-400" : "border-amber-200 bg-amber-50/50 text-amber-700 hover:border-amber-300"}`}>
                        {OB_FURN_DEFS[type].label}
                      </button>
                    ))}
                  </div>
                  <div className="text-[11px] text-slate-500 font-medium mb-2">Beyaz eşya — standart ölçü, sabit:</div>
                  <div className="flex flex-wrap gap-1.5">
                    {["fridge","washer","dryer","dishwasher","oven"].map(type => (
                      <button key={type} onClick={() => setObSelFurn(obSelFurn === type ? null : type)}
                        className={`text-xs px-2.5 py-1.5 rounded-lg border transition ${obSelFurn === type ? "border-slate-500 bg-slate-100 text-slate-700" : "border-slate-200 text-slate-600 hover:border-slate-300"}`}>
                        {OB_FURN_DEFS[type].label}
                        <span className="ml-1 text-[9px] text-slate-400">{OB_FURN_DEFS[type].w}×{OB_FURN_DEFS[type].h}</span>
                      </button>
                    ))}
                    <button onClick={() => setObFurniture([])} className="text-xs px-2.5 py-1.5 rounded-lg border border-red-200 text-red-500 hover:border-red-300 transition">Temizle</button>
                  </div>
                </div>
                {obSelFurn && <div className="text-[11px] text-primary bg-primary/5 rounded-lg px-3 py-2">"{OB_FURN_DEFS[obSelFurn]?.label}" seçildi — plana tıkla{!OB_FURN_DEFS[obSelFurn]?.fixed ? " · Köşeden boyutunu ayarla" : ""}</div>}
                <div className="relative rounded-xl overflow-hidden border border-slate-200">
                  <canvas ref={obCanvasRef} height={220}
                    style={{ display:"block", width:"100%", cursor: obSelFurn ? "crosshair" : obHoverFurnId ? "grab" : "default" }}
                    onMouseDown={obCanvasPointerDown} onMouseMove={obCanvasPointerMove}
                    onMouseUp={obCanvasPointerUp} onMouseLeave={obCanvasPointerUp} />
                  {obScanActive && (
                    <div className="absolute inset-0 bg-black/85 rounded-xl flex flex-col items-center justify-center gap-3">
                      <div className="text-sm font-medium text-white">Oda taranıyor...</div>
                      <div className="w-24 h-24 border-2 border-blue-400 rounded relative overflow-hidden">
                        <div className="absolute inset-0 border-[3px] border-transparent before:absolute before:w-4 before:h-4 before:top-0 before:left-0 before:border-t-2 before:border-l-2 before:border-blue-400" />
                        <div className="absolute w-full h-0.5 bg-blue-400/70 top-1/2 animate-bounce" />
                      </div>
                      <div className="text-xs text-white/60">Kamerayı köşelere doğrult</div>
                    </div>
                  )}
                  <div style={{ height:0 }} ref={el => {
                    if (el && obCanvasRef.current) {
                      const p = obCanvasRef.current.parentElement;
                      if (p) { const w = p.clientWidth; if (obCanvasRef.current.width !== w) { obCanvasRef.current.width = w; obDrawCanvas(); } }
                    }
                  }} />
                </div>
                <p className="text-[10px] text-slate-400 text-center">Eşyayı sürükle · <span className="text-amber-600">Turuncu köşe = boyut değiştir</span></p>
              </>
            )}

            {/* Step 2: Şablon */}
            {obStep === 2 && (
              <>
                <div>
                  <div className="text-base font-semibold text-slate-800 mb-1">Şablon seç</div>
                  <div className="text-xs text-slate-500">Başlangıç noktası — her şey değiştirilebilir.</div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {(Object.keys(TEMPLATE_META) as TemplateKey[]).map(key => (
                    <button key={key} onClick={() => obPickTemplate(key)}
                      className={`rounded-xl border p-3 flex flex-col items-center gap-1.5 transition ${obTemplate === key ? "border-primary bg-primary/5 border-2" : "border-slate-200 hover:border-primary/40"}`}>
                      <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center">
                        <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                          <rect x="2" y="2" width="24" height="24" rx="2" stroke="#94a3b8" strokeWidth="0.8"/>
                          {key==="kitchen"&&<><rect x="2" y="2" width="24" height="8" rx="2" fill="#d1d5db"/><line x1="2" y1="17" x2="26" y2="17" stroke="#94a3b8" strokeWidth="0.8"/><circle cx="14" cy="21" r="1.2" fill="#94a3b8"/></>}
                          {key==="wardrobe"&&<><line x1="14" y1="2" x2="14" y2="26" stroke="#94a3b8" strokeWidth="0.8"/><line x1="4" y1="12" x2="12" y2="12" stroke="#94a3b8" strokeWidth="0.8"/><line x1="16" y1="12" x2="24" y2="12" stroke="#94a3b8" strokeWidth="0.8"/><line x1="6" y1="5" x2="6" y2="11" stroke="#6b7280" strokeWidth="1.5" strokeLinecap="round"/></>}
                          {key==="laundry"&&<><line x1="2" y1="9" x2="26" y2="9" stroke="#94a3b8" strokeWidth="1.2"/><line x1="2" y1="16" x2="26" y2="16" stroke="#94a3b8" strokeWidth="1.2"/><line x1="2" y1="23" x2="26" y2="23" stroke="#94a3b8" strokeWidth="1.2"/></>}
                          {key==="tv"&&<><rect x="2" y="15" width="24" height="11" rx="2" fill="#d1d5db" stroke="#94a3b8" strokeWidth="0.5"/><rect x="4" y="4" width="20" height="9" rx="1" fill="#e2e8f0"/></>}
                          {key==="shoe"&&<><line x1="2" y1="7" x2="26" y2="7" stroke="#94a3b8" strokeWidth="1"/><line x1="2" y1="13" x2="26" y2="13" stroke="#94a3b8" strokeWidth="1"/><line x1="2" y1="19" x2="26" y2="19" stroke="#94a3b8" strokeWidth="1"/><path d="M4 9 Q8 10 12 7" stroke="#94a3b8" strokeWidth="0.8" fill="none" strokeLinecap="round"/></>}
                          {key==="custom"&&<><line x1="9" y1="14" x2="19" y2="14" stroke="#94a3b8" strokeWidth="1.8" strokeLinecap="round"/><line x1="14" y1="9" x2="14" y2="19" stroke="#94a3b8" strokeWidth="1.8" strokeLinecap="round"/></>}
                        </svg>
                      </div>
                      <div className="text-xs font-medium text-slate-700">{TEMPLATE_META[key].name}</div>
                      <div className="text-[9px] text-slate-400">{TEMPLATE_META[key].sub}</div>
                    </button>
                  ))}
                </div>
              </>
            )}

            {/* Step 3: İç Düzen */}
            {obStep === 3 && (
              <>
                <div>
                  <div className="text-base font-semibold text-slate-800 mb-1">İç düzeni ayarla</div>
                  <div className="text-xs text-slate-500 leading-relaxed">Sürükle-bırak ile sırala, ekle veya sil.</div>
                </div>
                <div className="bg-blue-50 border border-blue-100 rounded-xl px-3 py-2 text-[11px] text-blue-700 flex items-start gap-2">
                  <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="flex-shrink-0 mt-0.5"><path d="M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20"/></svg>
                  <span>3D editörde <strong className="font-medium">sağ kenar</strong> → genişlik, <strong className="font-medium">üst kenar</strong> → yükseklik sürüklenir.</span>
                </div>
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 flex justify-between">
                    <span className="text-xs font-medium text-slate-600">Bölümler</span>
                    <span className="text-[10px] text-slate-400">{obSections.reduce((s, x) => s + x.heightCm, 0)} cm toplam</span>
                  </div>
                  {obSections.length === 0 && <div className="px-3 py-4 text-center text-xs text-slate-400">Bölüm yok — aşağıdan ekle</div>}
                  {obSections.map((sec, idx) => (
                    <div key={sec.id} draggable onDragStart={() => obDragStart(idx)} onDragOver={e => obDragOver(e, idx)}
                      className="flex items-center gap-2 px-3 py-2.5 border-b border-slate-100 last:border-0 hover:bg-slate-50 cursor-grab">
                      <span className="text-slate-300">⠿</span>
                      <span className="flex-1 text-xs text-slate-700">{OB_TYPE_ICONS[sec.type]}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-100">{sec.heightCm} cm yükseklik</span>
                      <button onClick={() => obDeleteSection(sec.id)} className="text-red-300 hover:text-red-500 text-sm">×</button>
                    </div>
                  ))}
                  <div className="flex gap-1.5 p-2.5 flex-wrap">
                    <span className="text-[10px] text-slate-400 self-center">Ekle:</span>
                    {(["shelf","drawer","hanger","open"] as const).map(t => (
                      <button key={t} onClick={() => obAddSection(t)}
                        className="text-[11px] px-2 py-1 rounded-full border border-slate-200 text-slate-600 hover:border-primary hover:text-primary hover:bg-primary/5 transition">
                        {OB_TYPE_ICONS[t]}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Step 4: Hazır */}
            {obStep === 4 && (
              <div className="text-center pt-4">
                <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-3">
                  <svg width="20" height="20" fill="none" stroke="#16a34a" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                </div>
                <div className="text-base font-semibold text-slate-800 mb-1">Tasarıma hazır</div>
                <div className="text-xs text-slate-500 mb-5">3D editörde her şeyi değiştirebilirsiniz</div>
                <div className="grid grid-cols-2 gap-2 text-left">
                  {[
                    ["Alan ölçüsü", `${obRoom.width}×${obRoom.depth}×${obRoom.height} cm`],
                    ["Şablon", obTemplate ? TEMPLATE_META[obTemplate].name : "—"],
                    ["Bölüm sayısı", `${obSections.length} bölüm`],
                    ["Eşya", `${obFurniture.length} adet`],
                  ].map(([l, v]) => (
                    <div key={l as string} className="bg-slate-50 rounded-lg px-3 py-2.5">
                      <div className="text-[10px] text-slate-400 mb-0.5">{l}</div>
                      <div className="text-sm font-medium text-slate-700">{v}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>

          {/* Footer */}
          <div className="px-6 pb-6 pt-3 border-t border-slate-100 flex gap-2">
            {obStep > 0 && (
              <button onClick={() => setObStep(prev => Math.max(0, prev - 1) as 0|1|2|3|4)}
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition">
                ← Geri
              </button>
            )}
            <button
              disabled={obStep === 2 && !obTemplate}
              onClick={() => { if (obStep < 4) setObStep(prev => (prev + 1) as 0|1|2|3|4); else obFinish(); }}
              className="flex-1 py-2.5 rounded-xl bg-primary text-white text-xs font-semibold hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed transition">
              {obStep === 4 ? "3D Editörü Aç →" : obStep === 0 ? "Eşya Yerleşimine Geç →" : obStep === 1 ? "Şablon Seç →" : obStep === 2 ? "İç Düzen →" : "Devam →"}
            </button>
          </div>
        </div>
      </div>
    );
  };

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen flex flex-col bg-appbg">
      {showOnboarding && obRenderOnboarding()}

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
        <div className="flex items-center gap-2">
          {/* Oda planına geri dön */}
          <button
            onClick={() => setShowOnboarding(true)}
            className="px-3 py-2 rounded-2xl border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 transition flex items-center gap-1.5"
          >
            <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z"/></svg>
            Planı Düzenle
          </button>
          <button
            onClick={() => setShowBuyLinks(true)}
            className="px-4 py-2 rounded-2xl bg-emerald-500 text-white text-xs font-semibold shadow-sm hover:bg-emerald-600 transition flex items-center gap-1.5"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4zM3 6h18M16 10a4 4 0 01-8 0"/></svg>
            Tasarımı Bitir
          </button>
          <button
            onClick={handleExportAR}
            disabled={exporting}
            className="px-4 py-2 rounded-2xl bg-primary text-white text-xs font-semibold shadow-sm hover:bg-blue-600 disabled:opacity-60 disabled:cursor-not-allowed transition"
          >
            {exporting ? "Hazırlanıyor..." : "Odamda Gör (AR)"}
          </button>
        </div>
      </header>

      <main className="flex-1 flex gap-4 px-6 py-6">

        {/* ── 3D Sahne ──────────────────────────────────────────────────── */}
        <section className="flex-1 relative">
          {/* ── HUD Overlay — Kullanıcı yönlendirme ── */}
          <div className="absolute top-3 left-3 right-3 z-10 pointer-events-none flex items-start justify-between gap-2">
            {/* Sol: Mevcut adım ipucu */}
            <div className="bg-white/90 backdrop-blur rounded-xl px-3 py-2 shadow-sm border border-slate-100 max-w-xs">
              {!selectedId && cabinets.length === 0 && (
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-primary text-[10px] font-bold">1</span>
                  </div>
                  <span className="text-[11px] text-slate-600">Sağdan <strong>Dolap İçi Düzenleyici</strong> ile bölüm ekle, ardından 3D'de görünür</span>
                </div>
              )}
              {cabinets.length > 0 && !selectedId && (
                <div className="flex items-center gap-2">
                  <svg width="14" height="14" fill="none" stroke="#2563EB" strokeWidth="2" viewBox="0 0 24 24" className="flex-shrink-0"><path d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5"/></svg>
                  <span className="text-[11px] text-slate-600">Dolaba <strong>tıkla</strong> → seç → kenarlardan boyutunu ayarla</span>
                </div>
              )}
              {selectedId && !placedProduct && (
                <div className="flex items-center gap-2">
                  <svg width="14" height="14" fill="none" stroke="#10B981" strokeWidth="2" viewBox="0 0 24 24" className="flex-shrink-0"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
                  <span className="text-[11px] text-slate-600">
                    <strong>↔ Sağ kenar</strong> genişlik &nbsp;·&nbsp;
                    <strong>↕ Üst kenar</strong> yükseklik &nbsp;·&nbsp;
                    <strong className="text-emerald-600">◆ Ön yüzey</strong> derinlik
                  </span>
                </div>
              )}
              {placedProduct && (
                <div className="flex items-center gap-2">
                  <span className="text-base">{placedProduct.product.icon}</span>
                  <span className="text-[11px] text-slate-600">
                    <strong>{placedProduct.product.name}</strong> — sürükle yerleştir
                    {placedProduct.product.d > 0 && selectedId && (() => {
                      const cab = cabinets.find(c => c.id === selectedId);
                      if (!cab) return null;
                      const cabD = Math.round(room.height * cab.heightRatio * cab.depthFactor);
                      const fits = placedProduct.product.d <= cabD;
                      return <span className={`ml-1 px-1.5 py-0.5 rounded text-[9px] font-semibold ${fits ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>{fits ? `✓ Sığar (${cabD}cm)` : `✗ Sığmaz (${cabD}cm)`}</span>;
                    })()}
                  </span>
                </div>
              )}
            </div>
            {/* Sağ: Hızlı eylemler */}
            <div className="flex gap-1.5 pointer-events-auto">
              <button onClick={() => setShowOnboarding(true)}
                className="bg-white/90 backdrop-blur rounded-xl px-3 py-2 shadow-sm border border-slate-100 text-[11px] text-slate-600 hover:bg-white hover:border-primary/30 transition flex items-center gap-1.5">
                <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z"/></svg>
                Oda Planı
              </button>
              {selectedId && (
                <button onClick={() => {
                  const hr = Math.min(0.98, (room.height-5)/room.height);
                  addCabinet("custom");
                }}
                  className="bg-primary/90 backdrop-blur rounded-xl px-3 py-2 shadow-sm text-[11px] text-white hover:bg-primary transition flex items-center gap-1.5">
                  <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  Yeni Dolap
                </button>
              )}
            </div>
          </div>
          {/* Alt HUD: seçili dolap özet bilgisi */}
          {selectedId && (() => {
            const cab = cabinets.find(c => c.id === selectedId);
            if (!cab) return null;
            const hCm = Math.round(room.height * cab.heightRatio);
            const wCm = Math.round(hCm * cab.widthFactor);
            const dCm = Math.round(hCm * cab.depthFactor);
            return (
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
                <div className="bg-slate-900/80 backdrop-blur rounded-xl px-4 py-2 shadow-lg flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-amber-400" />
                    <span className="text-white text-[11px] font-semibold">Dolap #{cab.id}</span>
                  </div>
                  <div className="flex gap-3 text-[10px]">
                    <span className="text-blue-300">G: <strong>{wCm} cm</strong></span>
                    <span className="text-blue-300">Y: <strong>{hCm} cm</strong></span>
                    <span className="text-emerald-300">D: <strong>{dCm} cm</strong></span>
                  </div>
                  {cab.customSections && cab.customSections.length > 0 && (
                    <div className="flex gap-1">
                      {cab.customSections.map(s => {
                        const dots: Record<string, string> = { shelf:"#60A5FA", drawer:"#FBBF24", "deep-drawer":"#FB923C", hanger:"#4ADE80", "jewelry-drawer":"#E879F9", "shoe-rack":"#818CF8", open:"#94A3B8" };
                        return <div key={s.id} className="w-1.5 h-3 rounded-sm" style={{ background: dots[s.type] ?? "#94a3b8" }} title={s.type} />;
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
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

              {/* ── Oda Planı Mobilyaları — onboarding'den gelen eşyalar ── */}
              {obFurniture.map(item => {
                const def = OB_FURN_DEFS[item.type];
                if (!def) return null;
                const fw = item.w * CM_TO_M;
                const fh = 0.5; // Mobilya yüksekliği 50cm sabit (sembolik)
                const fd = item.h * CM_TO_M;
                // 2D plan koordinatlarını 3D dünya koordinatlarına çevir
                // Plan: rx=0 → sol duvar, ry=0 → arka duvar
                const x3d = (item.rx + item.w / 2) * CM_TO_M - roomWidthM / 2;
                const z3d = (item.ry + item.h / 2) * CM_TO_M - roomDepthM / 2;
                const furColor = item.type === "cab-mark" ? "#3B82F6" : def.color;
                return (
                  <group key={item.id} position={[x3d, fh / 2, z3d]}>
                    <mesh>
                      <boxGeometry args={[fw, fh, fd]} />
                      <meshStandardMaterial
                        color={furColor}
                        transparent
                        opacity={item.type === "cab-mark" ? 0.20 : 0.35}
                        depthWrite={false}
                      />
                    </mesh>
                    <lineSegments>
                      <edgesGeometry args={[new THREE.BoxGeometry(fw, fh, fd)]} />
                      <lineBasicMaterial color={item.type === "cab-mark" ? "#1D4ED8" : "#888780"} />
                    </lineSegments>
                    <Html position={[0, fh / 2 + 0.08, 0]} center distanceFactor={5} style={{ pointerEvents: "none" }}>
                      <div style={{
                        fontSize: 9, fontFamily: "system-ui", fontWeight: 600,
                        color: item.type === "cab-mark" ? "#1D4ED8" : "#444441",
                        background: "rgba(255,255,255,0.85)",
                        borderRadius: 4, padding: "2px 5px",
                        whiteSpace: "nowrap",
                        border: `1px solid ${item.type === "cab-mark" ? "#93C5FD" : "#D1D5DB"}`,
                      }}>
                        {def.label}
                      </div>
                    </Html>
                  </group>
                );
              })}

              {/* Dolaplar */}
              <group ref={exportGroupRef}>
                {cabinets.map(cab => (
                  <group
                    key={cab.id}
                    onPointerEnter={() => {}}
                    onPointerLeave={() => {}}
                  >
                  <CabinetMesh
                    cab={cab}
                    room={room}
                    selected={cab.id === selectedId}
                    onChangePosition={updateCabinetPosition}
                    onChangeWidthFactor={updateCabinetWidthFactor}
                    onChangeHeightFactor={updateCabinetHeightFactor}
                    onChangeDepthFactor={updateCabinetDepthFactor}
                    onSelect={setSelectedId}
                    onInteractionStart={() => setOrbitInteracting(true)}
                    onInteractionEnd={() => setOrbitInteracting(false)}
                    dragMeasure={dragMeasure?.cabId === cab.id ? { value: dragMeasure.value, type: dragMeasure.type } : null}
                    onWidthDragValue={v => handleWidthDragValue(cab.id, v)}
                    onHeightDragValue={v => handleHeightDragValue(cab.id, v)}
                    onDepthDragValue={v => handleDepthDragValue(cab.id, v)}
                    onWidthDragEnd={handleWidthDragEnd}
                    onHeightDragEnd={handleHeightDragEnd}
                    onDepthDragEnd={handleDepthDragEnd}
                    editingShelf={editingShelf}
                    onShelfDoubleClick={(cid, idx) => setEditingShelf({ cabId: cid, sectionIndex: idx })}
                    onShelfHeightSubmit={updateCabinetShelfHeight}
                    onSectionResize={(cabId, divIdx, newTopH, newBotH) => {
                      setCabinets(prev => prev.map(c => {
                        if (c.id !== cabId) return c;
                        const secs = [...(c.customSections ?? [])];
                        if (secs[divIdx] && secs[divIdx + 1]) {
                          secs[divIdx] = { ...secs[divIdx], heightCm: newTopH };
                          secs[divIdx + 1] = { ...secs[divIdx + 1], heightCm: newBotH };
                        }
                        return { ...c, customSections: secs };
                      }));
                    }}
                  />
                  </group>
                ))}
              </group>

              <OrbitControls
                makeDefault
                enableZoom
                enableRotate={!orbitInteracting && !placedProduct}
                enablePan={!orbitInteracting && !placedProduct}
                maxPolarAngle={Math.PI / 2.1}
              />

              {/* ── Ürün Dene — Tek mesh, tek düzlem, eksen panelden ── */}
              {placedProduct && (() => {
                const { product: prod, pos, rotated } = placedProduct;
                // rotated=true → ürün düşey: genişlik ve yükseklik yer değiştirir (pantolon uzunlamasına)
                const pW = (rotated ? prod.h : prod.w) * CM_TO_M;
                const pH = (rotated ? prod.w : prod.h) * CM_TO_M;
                const pD = prod.d * CM_TO_M;

                // En yakın dolaba göre sığma kontrolü
                const nearCab = cabinets.reduce<typeof cabinets[0] | null>((best, cab) => {
                  const hCm = room.height * cab.heightRatio;
                  const W = hCm * cab.widthFactor * CM_TO_M;
                  const H = hCm * CM_TO_M;
                  const D = hCm * cab.depthFactor * CM_TO_M;
                  const dist = Math.hypot(pos[0] - cab.x, pos[2] - cab.z);
                  const inside = Math.abs(pos[0] - cab.x) < W / 2 + pW / 2 + 0.08
                    && Math.abs(pos[2] - cab.z) < D / 2 + pD / 2 + 0.08
                    && pos[1] < H + 0.08;
                  if (inside && (!best || dist < Math.hypot(pos[0] - best.x, pos[2] - best.z))) return cab;
                  return best;
                }, null);

                const fits = nearCab
                  ? prod.w <= Math.round(nearCab.widthFactor * room.height * nearCab.heightRatio)
                    && prod.d <= Math.round(nearCab.depthFactor * room.height * nearCab.heightRatio)
                    && prod.h <= Math.round(room.height * nearCab.heightRatio)
                  : null; // null = dolap yok, kontrol yok

                const boxColor = fits === null ? "#3B82F6" : fits ? "#10B981" : "#EF4444";

                return (
                  <group position={pos}>
                    {/* Tıklanabilir / sürüklenebilir ürün kutusu — TEK mesh */}
                    <mesh
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        (e.target as HTMLElement).setPointerCapture(e.pointerId);
                        productDragging.current = true;
                      }}
                      onPointerMove={(e) => {
                        e.stopPropagation();
                        if (!productDragging.current) return;
                        if (!(e.target as HTMLElement).hasPointerCapture(e.pointerId)) return;
                        const hit = new THREE.Vector3();
                        if (productAxis === "xz") {
                          // Zemin düzlemi — Y sabit, X ve Z serbest
                          const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -pos[1]);
                          if (!e.ray.intersectPlane(plane, hit)) return;
                          setPlacedProduct(prev => prev ? { ...prev, pos: [hit.x, prev.pos[1], hit.z] } : prev);
                        } else {
                          // Dikey düzlem kameraya dik — Y serbest, XZ sabit
                          // kamera yönünü al ve buna dik düzlem oluştur
                          const camDir = e.camera.position.clone().normalize();
                          camDir.y = 0;
                          camDir.normalize();
                          const plane = new THREE.Plane(camDir, -(camDir.dot(new THREE.Vector3(...pos))));
                          if (!e.ray.intersectPlane(plane, hit)) return;
                          setPlacedProduct(prev => prev ? { ...prev, pos: [prev.pos[0], Math.max(pH / 2, hit.y), prev.pos[2]] } : prev);
                        }
                      }}
                      onPointerUp={(e) => {
                        e.stopPropagation();
                        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
                        productDragging.current = false;
                      }}
                    >
                      <boxGeometry args={[pW, pH, pD]} />
                      <meshStandardMaterial
                        color={boxColor}
                        transparent
                        opacity={0.35}
                        depthWrite={false}
                      />
                    </mesh>

                    {/* Kenar çizgisi */}
                    <lineSegments renderOrder={1}>
                      <edgesGeometry args={[new THREE.BoxGeometry(pW, pH, pD)]} />
                      <lineBasicMaterial color={boxColor} linewidth={2} />
                    </lineSegments>

                    {/* Etiket */}
                    <Html
                      position={[0, pH / 2 + 0.14, 0]}
                      center
                      distanceFactor={3}
                      style={{ pointerEvents: "none" }}
                    >
                      <div style={{
                        background: "rgba(15,23,42,0.92)",
                        color: "white",
                        borderRadius: 10,
                        padding: "5px 9px",
                        fontSize: 12,
                        fontWeight: 700,
                        whiteSpace: "nowrap",
                        fontFamily: "system-ui,sans-serif",
                        boxShadow: "0 2px 10px rgba(0,0,0,0.4)",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: 2,
                      }}>
                        <span style={{ fontSize: 20 }}>{prod.icon}</span>
                        <span style={{ fontSize: 11 }}>{prod.name}</span>
                        <span style={{ fontSize: 9, opacity: 0.6 }}>{prod.w}×{prod.d}×{prod.h} cm</span>
                        {fits !== null && (
                          <span style={{
                            fontSize: 10, fontWeight: 800, marginTop: 1,
                            color: fits ? "#6EE7B7" : "#FCA5A5",
                          }}>
                            {fits ? "✓ Sığar" : "✗ Sığmaz"}
                          </span>
                        )}
                        <span style={{
                          fontSize: 8, opacity: 0.5, marginTop: 1,
                          color: productAxis === "xz" ? "#60A5FA" : "#34D399",
                        }}>
                          {productAxis === "xz" ? "← → ↑↓ hareket" : "▲▼ yükseklik"}
                        </span>
                      </div>
                    </Html>
                  </group>
                );
              })()}
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

          {/* ── Dolap İçi Düzenleyici ── */}
          <div className="bg-white/80 backdrop-blur rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold text-slate-700">Dolap İçi Düzenleyici</div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  {selectedCab ? `${VARIANT_LABELS[selectedCab.variant]} seçili` : "Sol panelden bir dolap seç"}
                </div>
              </div>
              {selectedCab && (
                <div className="text-[10px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded-lg">
                  {Math.round(room.height * selectedCab.heightRatio)} cm
                </div>
              )}
            </div>

            {/* Eklenti paleti — çizim bloğu mantığında */}
            <div className="p-3 border-b border-slate-100">
              <div className="text-[10px] text-slate-400 font-medium mb-2 uppercase tracking-wide">Bölüm ekle</div>
              <div className="grid grid-cols-4 gap-1.5">
                {([
                  { type: "shelf"          as const, label: "Raf",        color: "#E0F2FE", icon: (
                    <svg width="22" height="18" viewBox="0 0 22 18" fill="none"><rect x="1" y="7" width="20" height="3" rx="1" fill="#0ea5e9"/><rect x="1" y="1" width="2" height="16" rx="1" fill="#94a3b8"/><rect x="19" y="1" width="2" height="16" rx="1" fill="#94a3b8"/></svg>
                  )},
                  { type: "drawer"         as const, label: "Çekmece",   color: "#FEF3C7", icon: (
                    <svg width="22" height="18" viewBox="0 0 22 18" fill="none"><rect x="1" y="3" width="20" height="12" rx="2" fill="#fbbf24" opacity=".3"/><rect x="1" y="3" width="20" height="12" rx="2" stroke="#f59e0b" strokeWidth="1"/><rect x="8" y="8.5" width="6" height="1.5" rx="0.75" fill="#f59e0b"/></svg>
                  )},
                  { type: "deep-drawer"    as const, label: "Derin",      color: "#FDE8D8", icon: (
                    <svg width="22" height="18" viewBox="0 0 22 18" fill="none"><rect x="1" y="1" width="20" height="16" rx="2" fill="#fb923c" opacity=".25"/><rect x="1" y="1" width="20" height="16" rx="2" stroke="#f97316" strokeWidth="1"/><rect x="7" y="8.5" width="8" height="2" rx="1" fill="#f97316"/></svg>
                  )},
                  { type: "hanger"         as const, label: "Askılık",   color: "#F0FDF4", icon: (
                    <svg width="22" height="18" viewBox="0 0 22 18" fill="none"><path d="M11 3 Q11 7 2 12 H20 Q11 7 11 3Z" stroke="#22c55e" strokeWidth="1" fill="none" strokeLinejoin="round"/><circle cx="11" cy="3" r="1.5" stroke="#22c55e" strokeWidth="1" fill="none"/><line x1="2" y1="12" x2="20" y2="12" stroke="#22c55e" strokeWidth="1"/></svg>
                  )},
                  { type: "jewelry-drawer" as const, label: "Takı",       color: "#FDF4FF", icon: (
                    <svg width="22" height="18" viewBox="0 0 22 18" fill="none"><rect x="1" y="5" width="20" height="8" rx="2" fill="#d946ef" opacity=".2"/><rect x="1" y="5" width="20" height="8" rx="2" stroke="#d946ef" strokeWidth="1"/><circle cx="11" cy="9" r="1.5" fill="#d946ef"/><path d="M7 9h2M13 9h2" stroke="#d946ef" strokeWidth="0.8"/></svg>
                  )},
                  { type: "shoe-rack"      as const, label: "Ayakkabı",  color: "#F0F4FF", icon: (
                    <svg width="22" height="18" viewBox="0 0 22 18" fill="none"><line x1="1" y1="6" x2="21" y2="6" stroke="#6366f1" strokeWidth="1.2"/><line x1="1" y1="12" x2="21" y2="12" stroke="#6366f1" strokeWidth="1.2"/><path d="M4 8 Q7 9 10 6" stroke="#6366f1" strokeWidth="0.8" fill="none" strokeLinecap="round"/><path d="M12 8 Q15 9 18 6" stroke="#6366f1" strokeWidth="0.8" fill="none" strokeLinecap="round"/></svg>
                  )},
                  { type: "open"           as const, label: "Açık",       color: "#F8FAFC", icon: (
                    <svg width="22" height="18" viewBox="0 0 22 18" fill="none"><rect x="1" y="1" width="20" height="16" rx="2" stroke="#94a3b8" strokeWidth="1" strokeDasharray="3 2"/></svg>
                  )},
                  { type: "shelf"          as const, label: "+ Modül",    color: "#EFF6FF", icon: (
                    <svg width="22" height="18" viewBox="0 0 22 18" fill="none"><rect x="1" y="1" width="20" height="16" rx="2" fill="#3b82f6" opacity=".1"/><line x1="11" y1="5" x2="11" y2="13" stroke="#3b82f6" strokeWidth="1.5" strokeLinecap="round"/><line x1="7" y1="9" x2="15" y2="9" stroke="#3b82f6" strokeWidth="1.5" strokeLinecap="round"/></svg>
                  ), isAddModule: true },
                ] as { type: CustomSection["type"]; label: string; color: string; icon: React.ReactNode; isAddModule?: boolean }[]).map((item, i) => {
                  const defaults: Record<CustomSection["type"], number> = {
                    shelf: 35, drawer: 20, "deep-drawer": 35, hanger: 115,
                    "jewelry-drawer": 12, "shoe-rack": 20, open: 45
                  };
                  return (
                    <button
                      key={i}
                      onClick={() => {
                        if (!selectedCab) {
                          // Modül yoksa önce ekle
                          addCabinet("custom");
                          return;
                        }
                        if (item.isAddModule) { addCabinet("custom"); return; }
                        const newSec: CustomSection = { id: Date.now(), type: item.type, heightCm: defaults[item.type] };
                        setCabinets(prev => prev.map(c => c.id === selectedId
                          ? { ...c, variant: "custom", customSections: [...(c.customSections ?? []), newSec] }
                          : c
                        ));
                      }}
                      className="flex flex-col items-center gap-1 p-2 rounded-xl border transition hover:scale-105 active:scale-95"
                      style={{ background: item.color, borderColor: item.color === "#F8FAFC" ? "#e2e8f0" : "transparent" }}
                      title={item.label}
                    >
                      {item.icon}
                      <span className="text-[9px] font-medium text-slate-600 leading-none">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Görsel dolap editörü — seçili dolabın bölümleri */}
            {selectedCab ? (
              <div className="p-3">
                {/* Dolap kesit önizlemesi */}
                <div className="flex gap-2">
                  {/* Sol: görsel kesit */}
                  <div className="flex-shrink-0" style={{ width: 52 }}>
                    <div className="text-[9px] text-slate-400 mb-1 text-center">Kesit</div>
                    <div
                      className="relative rounded border border-slate-200 overflow-hidden"
                      style={{
                        width: 52,
                        height: Math.min(280, Math.max(80, (selectedCab.customSections ?? []).reduce((s, x) => s + x.heightCm, 0) * 0.7 + 20)),
                        background: "#f8fafc",
                      }}
                    >
                      {/* Dolap gövdesi */}
                      <div className="absolute inset-0 border-2 border-slate-300 rounded" style={{ margin: 2 }} />
                      {/* Bölümler */}
                      {(() => {
                        const secs = selectedCab.customSections ?? [];
                        const totalH = secs.reduce((s, x) => s + x.heightCm, 0) || 1;
                        const cabH = Math.round(room.height * selectedCab.heightRatio);
                        const scale = Math.min(260, Math.max(60, totalH * 0.7)) / totalH;
                        const typeColors: Record<string, string> = {
                          shelf: "#0ea5e9", drawer: "#f59e0b", "deep-drawer": "#f97316",
                          hanger: "#22c55e", "jewelry-drawer": "#d946ef", "shoe-rack": "#6366f1", open: "#e2e8f0"
                        };
                        let cumY = 4;
                        return secs.map((sec, idx) => {
                          const h = Math.max(4, sec.heightCm * scale);
                          const y = cumY; cumY += h;
                          const col = typeColors[sec.type] ?? "#94a3b8";
                          return (
                            <div key={sec.id} className="absolute left-1 right-1 flex items-center justify-center overflow-hidden"
                              style={{ top: y, height: h - 1, background: col + "22", borderBottom: `1px solid ${col}44`, borderRadius: 2 }}>
                              {h > 12 && (
                                <span style={{ fontSize: 7, color: col, fontWeight: 600, lineHeight: 1 }}>
                                  {sec.heightCm}
                                </span>
                              )}
                            </div>
                          );
                        });
                      })()}
                    </div>
                    <div className="text-[9px] text-slate-400 text-center mt-1">
                      {Math.round(room.height * selectedCab.heightRatio)} cm
                    </div>
                  </div>

                  {/* Sağ: bölüm listesi */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] text-slate-500 font-medium">Bölümler</span>
                      <span className="text-[9px] text-slate-400">
                        {(selectedCab.customSections ?? []).reduce((s, x) => s + x.heightCm, 0)} / {Math.round(room.height * selectedCab.heightRatio)} cm
                      </span>
                    </div>
                    {(!selectedCab.customSections || selectedCab.customSections.length === 0) ? (
                      <div className="text-center py-4 text-[10px] text-slate-400 border border-dashed border-slate-200 rounded-xl">
                        Yukarıdan bölüm ekle
                      </div>
                    ) : (
                      <div className="space-y-1 max-h-56 overflow-y-auto">
                        {selectedCab.customSections.map((sec, idx) => {
                          const typeLabel: Record<string, string> = {
                            shelf: "Raf", drawer: "Çekmece", "deep-drawer": "Derin çekmece",
                            hanger: "Askılık", "jewelry-drawer": "Takı çekmecesi",
                            "shoe-rack": "Ayakkabı rafı", open: "Açık alan"
                          };
                          const typeColor: Record<string, string> = {
                            shelf: "#0ea5e9", drawer: "#f59e0b", "deep-drawer": "#f97316",
                            hanger: "#22c55e", "jewelry-drawer": "#d946ef", "shoe-rack": "#6366f1", open: "#94a3b8"
                          };
                          const col = typeColor[sec.type] ?? "#94a3b8";
                          return (
                            <div key={sec.id}
                              className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg border border-slate-100 hover:border-slate-200 bg-white group"
                            >
                              {/* Renk bandı */}
                              <div className="w-1.5 h-6 rounded-full flex-shrink-0" style={{ background: col }} />
                              {/* Tip etiketi */}
                              <span className="text-[10px] font-medium text-slate-600 flex-1 truncate">
                                {typeLabel[sec.type] ?? sec.type}
                              </span>
                              {/* Yükseklik input */}
                              <input
                                type="number" min={8} max={250}
                                value={sec.heightCm}
                                onChange={e => {
                                  const v = Math.max(8, Math.min(250, parseInt(e.target.value) || 8));
                                  setCabinets(prev => prev.map(c => c.id === selectedId
                                    ? { ...c, customSections: (c.customSections ?? []).map(s =>
                                        s.id === sec.id ? { ...s, heightCm: v } : s
                                      )}
                                    : c
                                  ));
                                }}
                                className="w-10 text-[10px] text-center border border-slate-200 rounded px-0.5 py-0.5 font-semibold focus:outline-none focus:border-primary/50"
                                style={{ color: col }}
                              />
                              <span className="text-[9px] text-slate-400 flex-shrink-0">cm</span>
                              {/* Yukarı/aşağı */}
                              <div className="flex flex-col opacity-0 group-hover:opacity-100 transition">
                                <button disabled={idx === 0}
                                  onClick={() => setCabinets(prev => prev.map(c => {
                                    if (c.id !== selectedId) return c;
                                    const arr = [...(c.customSections ?? [])];
                                    [arr[idx-1], arr[idx]] = [arr[idx], arr[idx-1]];
                                    return { ...c, customSections: arr };
                                  }))}
                                  className="text-[8px] text-slate-400 hover:text-slate-700 disabled:opacity-20 leading-none">▲</button>
                                <button disabled={idx === (selectedCab.customSections?.length ?? 0) - 1}
                                  onClick={() => setCabinets(prev => prev.map(c => {
                                    if (c.id !== selectedId) return c;
                                    const arr = [...(c.customSections ?? [])];
                                    [arr[idx], arr[idx+1]] = [arr[idx+1], arr[idx]];
                                    return { ...c, customSections: arr };
                                  }))}
                                  className="text-[8px] text-slate-400 hover:text-slate-700 disabled:opacity-20 leading-none">▼</button>
                              </div>
                              {/* Sil */}
                              <button
                                onClick={() => setCabinets(prev => prev.map(c => c.id === selectedId
                                  ? { ...c, customSections: (c.customSections ?? []).filter(s => s.id !== sec.id) }
                                  : c
                                ))}
                                className="text-slate-200 hover:text-red-400 transition text-xs opacity-0 group-hover:opacity-100 flex-shrink-0"
                              >✕</button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {/* Toplam uyarısı */}
                    {(() => {
                      const total = (selectedCab.customSections ?? []).reduce((s, x) => s + x.heightCm, 0);
                      const max = Math.round(room.height * selectedCab.heightRatio);
                      if (total > max) return (
                        <div className="mt-1.5 text-[9px] text-red-500 bg-red-50 rounded px-2 py-1">
                          ⚠ Toplam {total} cm — dolap {max} cm ({total - max} cm fazla)
                        </div>
                      );
                      if (total > 0 && total < max) return (
                        <div className="mt-1.5 text-[9px] text-emerald-600 bg-emerald-50 rounded px-2 py-1">
                          ✓ {max - total} cm boş alan kaldı
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>
            ) : (
              <div className="px-4 py-5 text-center text-[11px] text-slate-400">
                <div className="w-10 h-10 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-2">
                  <svg width="18" height="18" fill="none" stroke="#94a3b8" strokeWidth="1.5" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
                </div>
                3D sahnede bir dolaba tıkla,<br/>sonra bölüm ekle
              </div>
            )}
          </div>

          {/* ── Ürün Dene ── */}
          <div className="bg-white/80 backdrop-blur rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <button
              onClick={() => { setShowProductPanel(v => !v); if (!showProductPanel) setTryProductId(null); }}
              className="w-full flex items-center justify-between px-4 py-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
            >
              <span className="flex items-center gap-2">
                <span>📦</span> Ürün Dene
                {tryProduct && <span className="bg-primary/10 text-primary rounded-full px-1.5 py-0.5 text-[10px] font-semibold">{tryProduct.name}</span>}
              </span>
              <span className="text-slate-400 text-[10px]">{showProductPanel ? "▲" : "▼"}</span>
            </button>

            {showProductPanel && (
              <div className="border-t border-slate-100 p-3 space-y-3">
                <p className="text-[10px] text-slate-400 leading-relaxed">
                  Ürün seçin, ardından 3D alanda dolabın üzerine getirin — sığıp sığmadığını görün.
                </p>

                {/* Kategori seçici */}
                <div className="flex flex-wrap gap-1">
                  {TRY_CATEGORIES.map(cat => (
                    <button
                      key={cat.id}
                      onClick={() => { setTryCategory(cat.id); setTryProductId(null); }}
                      className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold transition ${
                        tryCategory === cat.id
                          ? "bg-primary/10 text-primary border border-primary/30"
                          : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                      }`}
                    >
                      <span>{cat.icon}</span><span>{cat.label}</span>
                    </button>
                  ))}
                </div>

                {/* Ürün listesi */}
                <div className="space-y-1 max-h-52 overflow-y-auto pr-0.5">
                  {(TRY_PRODUCTS[tryCategory] || []).map(prod => (
                    <button
                      key={prod.id}
                      onClick={() => {
                        // Ürüne tıklanınca seçili (veya ilk) dolabın önüne derinlik göz önüne alınarak yerleştir
                        const targetCab = cabinets.find(c => c.id === selectedId) ?? cabinets[0];
                        let startPos: [number, number, number];
                        if (targetCab) {
                          const hCm = room.height * targetCab.heightRatio;
                          const dM = hCm * targetCab.depthFactor * CM_TO_M;
                          const pH = (prod.rotated ?? false) ? prod.w : prod.h;
                          startPos = [
                            targetCab.x,
                            pH * CM_TO_M / 2, // zemin üstünde
                            targetCab.z + dM / 2 + prod.d * CM_TO_M / 2 + 0.05,
                          ];
                        } else {
                          startPos = [0, prod.h * CM_TO_M / 2, 0.5];
                        }
                        if (placedProduct?.product.id === prod.id) {
                          setPlacedProduct(null);
                          setTryProductId(null);
                        } else {
                          setPlacedProduct({ product: prod, pos: startPos, rotated: false });
                          setTryProductId(prod.id);
                        }
                      }}
                      className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-xs transition text-left group ${
                        placedProduct?.product.id === prod.id
                          ? "bg-primary/10 border border-primary/30 text-primary"
                          : "hover:bg-slate-50 border border-transparent"
                      }`}
                    >
                      <span className="w-7 h-7 rounded-lg flex items-center justify-center text-sm flex-shrink-0"
                        style={{ background: prod.color + "33" }}>{prod.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-slate-700 truncate">{prod.name}</div>
                        <div className="text-[9px] text-slate-400">{prod.w}G × {prod.d}D × {prod.h}Y cm</div>
                      </div>
                      {placedProduct?.product.id === prod.id && (
                        <span className="text-primary text-[10px] font-bold flex-shrink-0">✓ Sahnede</span>
                      )}
                    </button>
                  ))}
                </div>

                {placedProduct && (
                  <div className="bg-slate-900 rounded-xl px-3 py-2.5 space-y-2">
                    <div className="text-[10px] text-slate-400 font-semibold">
                      🎯 <span className="text-white">{placedProduct.product.name}</span> sahnede
                    </div>
                    {/* Konumlandırma + Rotasyon */}
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => setProductAxis("xz")}
                        className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold transition ${
                          productAxis === "xz"
                            ? "bg-blue-500 text-white"
                            : "bg-slate-700 text-slate-400 hover:bg-slate-600"
                        }`}
                      >
                        ↔ Yatay
                      </button>
                      <button
                        onClick={() => setProductAxis("y")}
                        className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold transition ${
                          productAxis === "y"
                            ? "bg-emerald-500 text-white"
                            : "bg-slate-700 text-slate-400 hover:bg-slate-600"
                        }`}
                      >
                        ↕ Dikey
                      </button>
                    </div>
                    {/* Düşey/Yatay konumlandırma (askılık için) */}
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] text-slate-400">Ürün konumu:</span>
                      <div className="flex gap-1">
                        <button
                          onClick={() => setPlacedProduct(prev => prev ? { ...prev, rotated: false } : prev)}
                          className={`px-2 py-0.5 rounded text-[9px] font-bold transition ${
                            !placedProduct.rotated ? "bg-amber-500 text-white" : "bg-slate-700 text-slate-400"
                          }`}
                          title="Yatay — normal konumlandırma"
                        >
                          — Yatay
                        </button>
                        <button
                          onClick={() => setPlacedProduct(prev => prev ? { ...prev, rotated: true } : prev)}
                          className={`px-2 py-0.5 rounded text-[9px] font-bold transition ${
                            placedProduct.rotated ? "bg-amber-500 text-white" : "bg-slate-700 text-slate-400"
                          }`}
                          title="Düşey — pantolon/elbise uzunlamasına"
                        >
                          | Düşey
                        </button>
                      </div>
                    </div>
                    <div className="text-[9px] text-slate-500">
                      {placedProduct.rotated
                        ? "Düşey: pantolon/elbise uzunlamasına asılı"
                        : productAxis === "xz"
                        ? "Ürünü sürükle → yatay taşı"
                        : "Ürünü sürükle → yüksekliği ayarla"}
                    </div>
                    <button
                      onClick={() => { setPlacedProduct(null); setTryProductId(null); }}
                      className="w-full text-[9px] text-red-400 hover:text-red-300 font-semibold py-0.5"
                    >
                      × Sahneden Kaldır
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Seçili Dolap — Tabbed panel */}
          {selectedCab && (
            <div className="bg-white/80 backdrop-blur rounded-2xl shadow-sm border border-slate-200 overflow-hidden">

              {/* Header — ad + aksiyon butonları */}
              <div className="px-4 pt-3 pb-2 border-b border-slate-100">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-slate-700">
                    Dolap #{selectedCab.id}
                  </span>
                  <div className="flex gap-1">
                    <button onClick={rotateSelectedCabinet} title="90° Döndür"
                      className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
                    </button>
                    <button onClick={lockSelectedToNeighbor} disabled={cabinets.length < 2} title="Kilitle"
                      className={`p-1.5 rounded-lg transition ${selectedCab.lockedTo != null ? "bg-amber-50 text-amber-600" : "hover:bg-slate-100 text-slate-500 disabled:opacity-30"}`}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                    </button>
                    <button onClick={deleteSelected} title="Sil"
                      className="p-1.5 rounded-lg hover:bg-red-50 text-red-400 transition">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M9 6V4h6v2"/></svg>
                    </button>
                  </div>
                </div>
                {/* Tabs */}
                <div className="flex border border-slate-200 rounded-lg overflow-hidden">
                  {([
                    { id: "dims",     label: "Boyut" },
                    { id: "interior", label: "İç Yapı" },
                    { id: "style",    label: "Stil" },
                  ] as { id: typeof cabPanelTab; label: string }[]).map(tab => (
                    <button key={tab.id} onClick={() => setCabPanelTab(tab.id)}
                      className={`flex-1 py-1.5 text-[11px] font-medium transition ${cabPanelTab === tab.id ? "bg-primary text-white" : "text-slate-500 hover:bg-slate-50"}`}>
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* TAB: Boyut */}
              {cabPanelTab === "dims" && (
                <div className="px-4 py-3 space-y-3">
                  {/* 3 boyut — G / Y / D */}
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: "G (cm)", min: 40, max: 400, val: Math.round(room.height * selectedCab.heightRatio * selectedCab.widthFactor), onChange: updateSelectedWidthCm, hint: "→ sağ kenar" },
                      { label: "Y (cm)", min: 60, max: room.height - 5, val: Math.round(room.height * selectedCab.heightRatio), onChange: updateSelectedHeightCm, hint: "↑ üst kenar" },
                      { label: "D (cm)", min: 20, max: 120, val: Math.round(room.height * selectedCab.heightRatio * selectedCab.depthFactor), onChange: updateSelectedDepthCm, hint: "◆ ön yüzey" },
                    ].map(({ label, min, max, val, onChange, hint }) => (
                      <label key={label} className="flex flex-col gap-1">
                        <span className="text-[10px] text-slate-500 font-medium">{label}</span>
                        <input type="number" min={min} max={max} value={val}
                          onChange={e => onChange(e.target.value)}
                          className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-semibold text-center focus:outline-none focus:ring-2 focus:ring-primary/40" />
                        <span className="text-[9px] text-slate-400 text-center">{hint}</span>
                      </label>
                    ))}
                  </div>
                  {/* Kapaklı toggle */}
                  <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                    <span className="text-[11px] font-medium text-slate-600">Kapaklı</span>
                    <button role="switch" aria-checked={selectedCab.hasDoor} onClick={toggleSelectedHasDoor}
                      className={`relative w-9 h-5 rounded-full transition ${selectedCab.hasDoor ? "bg-primary" : "bg-slate-300"}`}>
                      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition left-0.5 ${selectedCab.hasDoor ? "translate-x-4" : "translate-x-0"}`} />
                    </button>
                  </div>
                </div>
              )}

              {/* TAB: İç Yapı */}
              {cabPanelTab === "interior" && (
                <div className="p-3">
                  {/* Hızlı ekleme butonları */}
                  <div className="grid grid-cols-4 gap-1 mb-3">
                    {([
                      { type: "shelf" as const, label: "Raf", color: "#0ea5e9", h: 35 },
                      { type: "drawer" as const, label: "Çekmece", color: "#f59e0b", h: 20 },
                      { type: "deep-drawer" as const, label: "Derin", color: "#f97316", h: 35 },
                      { type: "hanger" as const, label: "Askı", color: "#22c55e", h: 115 },
                      { type: "jewelry-drawer" as const, label: "Takı", color: "#d946ef", h: 12 },
                      { type: "shoe-rack" as const, label: "Ayakkabı", color: "#6366f1", h: 20 },
                      { type: "open" as const, label: "Açık", color: "#94a3b8", h: 45 },
                    ]).map(({ type, label, color, h }) => (
                      <button key={type}
                        onClick={() => {
                          const ns: CustomSection = { id: Date.now(), type, heightCm: h };
                          setCabinets(prev => prev.map(c => c.id === selectedId
                            ? { ...c, variant: "custom" as const, customSections: [...(c.customSections ?? []), ns] }
                            : c));
                        }}
                        className="flex flex-col items-center gap-0.5 py-1.5 rounded-lg border border-slate-100 hover:border-slate-200 hover:bg-slate-50 transition"
                        style={{ borderLeftColor: color, borderLeftWidth: 2 }}>
                        <span className="text-[9px] font-medium text-slate-600 leading-tight text-center px-0.5">{label}</span>
                        <span className="text-[8px] text-slate-400">{h}cm</span>
                      </button>
                    ))}
                  </div>
                  {/* Bölüm listesi */}
                  {(!selectedCab.customSections || selectedCab.customSections.length === 0) ? (
                    <div className="text-center py-3 text-[10px] text-slate-400 border border-dashed border-slate-200 rounded-lg">
                      Yukarıdan bölüm ekle<br/>
                      <span className="text-[9px]">Bölme çizgisini 3D'de sürükleyerek boyutlandır</span>
                    </div>
                  ) : (
                    <div className="space-y-0.5 max-h-48 overflow-y-auto">
                      {(() => {
                        const typeLabel: Record<string, { l: string; c: string }> = {
                          shelf: { l: "Raf", c: "#0ea5e9" },
                          drawer: { l: "Çekmece", c: "#f59e0b" },
                          "deep-drawer": { l: "Derin çekmece", c: "#f97316" },
                          hanger: { l: "Askılık", c: "#22c55e" },
                          "jewelry-drawer": { l: "Takı çekmecesi", c: "#d946ef" },
                          "shoe-rack": { l: "Ayakkabı rafı", c: "#6366f1" },
                          open: { l: "Açık alan", c: "#94a3b8" },
                        };
                        const total = selectedCab.customSections!.reduce((s,x) => s + x.heightCm, 0);
                        const max = Math.round(room.height * selectedCab.heightRatio);
                        return selectedCab.customSections!.map((sec, idx) => {
                          const { l, c } = typeLabel[sec.type] ?? { l: sec.type, c: "#94a3b8" };
                          return (
                            <div key={sec.id} className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg group hover:bg-slate-50">
                              <div className="w-1 h-5 rounded-full flex-shrink-0" style={{ background: c }} />
                              <span className="flex-1 text-[10px] text-slate-600 truncate">{l}</span>
                              <input type="number" min={8} max={250} value={sec.heightCm}
                                onChange={e => {
                                  const v = Math.max(8, Math.min(250, parseInt(e.target.value) || 8));
                                  setCabinets(prev => prev.map(cab => cab.id === selectedId
                                    ? { ...cab, customSections: (cab.customSections ?? []).map(s => s.id === sec.id ? { ...s, heightCm: v } : s) }
                                    : cab));
                                }}
                                className="w-10 text-[10px] text-center border border-slate-200 rounded px-0.5 py-0.5 font-semibold focus:outline-none"
                                style={{ color: c }} />
                              <span className="text-[9px] text-slate-400">cm</span>
                              <div className="flex flex-col opacity-0 group-hover:opacity-100 transition flex-shrink-0">
                                <button disabled={idx === 0}
                                  onClick={() => setCabinets(prev => prev.map(cab => {
                                    if (cab.id !== selectedId) return cab;
                                    const arr = [...(cab.customSections ?? [])];
                                    [arr[idx-1], arr[idx]] = [arr[idx], arr[idx-1]];
                                    return { ...cab, customSections: arr };
                                  }))} className="text-[8px] text-slate-400 hover:text-slate-700 disabled:opacity-20">▲</button>
                                <button disabled={idx === selectedCab.customSections!.length - 1}
                                  onClick={() => setCabinets(prev => prev.map(cab => {
                                    if (cab.id !== selectedId) return cab;
                                    const arr = [...(cab.customSections ?? [])];
                                    [arr[idx], arr[idx+1]] = [arr[idx+1], arr[idx]];
                                    return { ...cab, customSections: arr };
                                  }))} className="text-[8px] text-slate-400 hover:text-slate-700 disabled:opacity-20">▼</button>
                              </div>
                              <button onClick={() => setCabinets(prev => prev.map(cab => cab.id === selectedId
                                ? { ...cab, customSections: (cab.customSections ?? []).filter(s => s.id !== sec.id) }
                                : cab))} className="text-slate-200 hover:text-red-400 transition opacity-0 group-hover:opacity-100 text-xs">✕</button>
                            </div>
                          );
                        });
                      })()}
                    </div>
                  )}
                  {/* Toplam gösterge */}
                  {selectedCab.customSections && selectedCab.customSections.length > 0 && (() => {
                    const total = selectedCab.customSections!.reduce((s,x) => s + x.heightCm, 0);
                    const max = Math.round(room.height * selectedCab.heightRatio);
                    const over = total > max;
                    return (
                      <div className={`mt-2 text-[9px] px-2 py-1 rounded flex items-center justify-between ${over ? "bg-red-50 text-red-500" : "bg-slate-50 text-slate-500"}`}>
                        <span>{over ? "⚠ Fazla:" : "Toplam:"} {total} cm</span>
                        <span>Dolap: {max} cm{over ? ` (+${total-max})` : ` (${max-total} boş)`}</span>
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* TAB: Stil */}
              {cabPanelTab === "style" && (
                <div className="px-4 py-3 space-y-3">
                  {/* Kapak stili */}
                  {selectedCab.hasDoor && (
                    <div>
                      <div className="text-[10px] font-medium text-slate-500 mb-1.5">Kapak stili</div>
                      <div className="grid grid-cols-3 gap-1.5">
                        {([
                          { key: "classic" as DoorStyle, label: "Klasik", desc: "Göbekli" },
                          { key: "flat"    as DoorStyle, label: "Düz",    desc: "Modern" },
                          { key: "shaker"  as DoorStyle, label: "Shaker", desc: "Çerçeveli" },
                        ]).map(s => (
                          <button key={s.key}
                            onClick={() => setCabinets(prev => prev.map(c => c.id === selectedId ? { ...c, doorStyle: s.key } : c))}
                            className={`flex flex-col items-center gap-1 px-1 py-2 rounded-xl border text-[10px] transition ${(selectedCab.doorStyle ?? "classic") === s.key ? "border-primary bg-primary/8 text-primary" : "border-slate-200 text-slate-600"}`}>
                            <div className="w-8 h-8 rounded border border-slate-200 flex items-center justify-center overflow-hidden" style={{ background: selectedCab.colorHex }}>
                              {s.key === "classic" && <svg width="20" height="24" viewBox="0 0 20 24" fill="none"><rect x="1" y="1" width="18" height="22" rx="1" fill={selectedCab.colorHex} stroke="rgba(0,0,0,0.12)" strokeWidth="0.8"/><rect x="2.5" y="2.5" width="15" height="8" rx="0.5" fill="rgba(255,255,255,0.14)" stroke="rgba(0,0,0,0.08)" strokeWidth="0.5"/><rect x="2.5" y="13" width="15" height="8" rx="0.5" fill="rgba(255,255,255,0.14)" stroke="rgba(0,0,0,0.08)" strokeWidth="0.5"/></svg>}
                              {s.key === "flat" && <svg width="20" height="24" viewBox="0 0 20 24" fill="none"><rect x="1" y="1" width="18" height="22" rx="1" fill={selectedCab.colorHex} stroke="rgba(0,0,0,0.12)" strokeWidth="0.8"/><rect x="8" y="10" width="4" height="4" rx="2" fill="rgba(0,0,0,0.15)"/></svg>}
                              {s.key === "shaker" && <svg width="20" height="24" viewBox="0 0 20 24" fill="none"><rect x="1" y="1" width="18" height="22" rx="1" fill={selectedCab.colorHex} stroke="rgba(0,0,0,0.12)" strokeWidth="0.8"/><rect x="2.5" y="2.5" width="15" height="19" rx="0.5" fill="rgba(255,255,255,0.08)" stroke="rgba(0,0,0,0.12)" strokeWidth="1.2"/><rect x="8" y="10" width="4" height="4" rx="2" fill="rgba(0,0,0,0.15)"/></svg>}
                            </div>
                            <span>{s.label}</span>
                            <span className="text-[8px] text-slate-400">{s.desc}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {/* Kaplama */}
                  <div>
                    <div className="text-[10px] font-medium text-slate-500 mb-1.5">Kaplama</div>
                    <div className="grid grid-cols-3 gap-1.5">
                      {(Object.entries(MATERIALS) as [MaterialType, MaterialDef][]).map(([key, mat]) => (
                        <button key={key} onClick={() => updateSelectedMaterial(key)}
                          className={`flex flex-col items-center gap-1 px-1 py-2 rounded-xl border text-[10px] transition ${selectedCab.material === key ? "border-primary bg-primary/8 text-primary" : "border-slate-200 text-slate-600"}`}>
                          <div className="w-7 h-7 rounded-lg border border-slate-200 shadow-sm" style={{
                            background: key === "akrilik"
                              ? `linear-gradient(135deg, rgba(255,255,255,0.3) 0%, transparent 30%, ${selectedCab.colorHex} 70%)`
                              : key === "lake"
                              ? `linear-gradient(135deg, rgba(255,255,255,0.1) 0%, ${selectedCab.colorHex} 100%)`
                              : selectedCab.colorHex
                          }} />
                          <span>{mat.label}</span>
                          <span className="text-[8px] text-slate-400">{mat.pricePerM2}₺/m²</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* Renk */}
                  <div>
                    <div className="text-[10px] font-medium text-slate-500 mb-1.5">Renk</div>
                    <div className="flex gap-1.5 flex-wrap">
                      {COLOR_PALETTES[selectedCab.material].map(({ label, hex }) => (
                        <button key={hex} onClick={() => updateSelectedColor(hex)} title={label}
                          className={`w-7 h-7 rounded-full border-2 transition hover:scale-110 ${selectedCab.colorHex === hex ? "border-primary scale-110" : "border-transparent"}`}
                          style={{ background: hex }} />
                      ))}
                    </div>
                  </div>
                  {/* Maliyet */}
                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-[10px] text-slate-500">Bu dolap tahmini maliyet</span>
                    <span className="text-sm font-bold text-slate-800">
                      {cabinetCost(selectedCab, room.height).toLocaleString("tr-TR")} ₺
                    </span>
                  </div>
                </div>
              )}

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

            {/* Tasarımı Tamamla butonu */}
            <button
              onClick={() => setShowBuyLinks(true)}
              className="w-full mt-1 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white text-xs font-bold transition flex items-center justify-center gap-2"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
              Tasarımı Bitir → Ürünleri Ara
            </button>
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

      {/* ── Tasarımı Bitir — Arama Bağlantıları Modal ──────────────────── */}
      {showBuyLinks && (() => {
        // Dolapların ölçülerini al — arama sorgularına ekle
        const cabSizes = cabinets.map(c => {
          const hCm = Math.round(room.height * c.heightRatio);
          const wCm = Math.round(hCm * c.widthFactor);
          const dCm = Math.round(hCm * c.depthFactor);
          return { label: VARIANT_LABELS[c.variant], w: wCm, h: hCm, d: dCm, material: MATERIALS[c.material].label };
        });

        // Arama URL'i oluştur
        const makeSearchUrl = (store: "trendyol" | "google", query: string) => {
          const encoded = encodeURIComponent(query);
          if (store === "trendyol") return `https://www.trendyol.com/sr?q=${encoded}`;
          return `https://www.google.com/search?q=${encoded}`;
        };

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full max-h-[88vh] overflow-hidden flex flex-col">
              {/* Başlık */}
              <div className="px-6 pt-6 pb-4 border-b border-slate-100">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-bold text-xl text-slate-900 tracking-tight">Tasarımınız Hazır! 🎉</div>
                    <div className="text-sm text-slate-500 mt-0.5">Ölçülerinize uygun ürünleri arayın</div>
                  </div>
                  <button onClick={() => setShowBuyLinks(false)} className="text-slate-400 hover:text-slate-600 text-xl leading-none p-1">×</button>
                </div>

                {/* Maliyet özeti */}
                <div className="mt-4 bg-slate-900 rounded-2xl px-4 py-3 flex items-center justify-between">
                  <div>
                    <div className="text-xs text-slate-400 font-medium">Tahmini Mobilya Maliyeti</div>
                    <div className="text-xl font-bold text-white tracking-tight">
                      {totalCost.toLocaleString("tr-TR")} ₺
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-slate-400">{cabinets.length} modül</div>
                    <div className="text-xs text-slate-500 mt-0.5">* KDV hariç tahmini</div>
                  </div>
                </div>

                {/* Modül ölçüleri */}
                {cabSizes.length > 0 && (
                  <div className="mt-3 space-y-1">
                    {cabSizes.map((c, i) => (
                      <div key={i} className="flex items-center justify-between text-xs text-slate-500 px-1">
                        <span className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-sm bg-primary/20 flex-shrink-0" />
                          {c.label} · {c.material}
                        </span>
                        <span className="font-medium text-slate-600 tabular-nums">{c.w}G × {c.d}D × {c.h}Y cm</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Ürün arama bölümü */}
              <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
                <div className="flex items-center gap-2">
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Ürün Aramaları</div>
                  <div className="text-[10px] text-slate-400 bg-slate-100 rounded-full px-2 py-0.5">Ölçülerinize göre özelleştirildi</div>
                </div>

                {TRY_CATEGORIES.map(cat => {
                  const prods = (TRY_PRODUCTS[cat.id] || []).slice(0, 5);
                  return (
                    <div key={cat.id}>
                      <div className="flex items-center gap-2 mb-2.5">
                        <span className="text-base">{cat.icon}</span>
                        <span className="text-xs font-bold text-slate-700">{cat.label}</span>
                      </div>
                      <div className="space-y-1.5">
                        {prods.map(prod => {
                          // Ölçü bilgisini arama sorgusuna ekle
                          const sizeHint = `${prod.w}x${prod.d}x${prod.h}cm`;
                          const fullQuery = `${prod.searchQuery} ${sizeHint}`;
                          return (
                            <div key={prod.id} className="rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2 flex items-center gap-2.5">
                              <span className="w-7 h-7 rounded-lg flex items-center justify-center text-sm flex-shrink-0" style={{ background: prod.color + "33" }}>{prod.icon}</span>
                              <div className="flex-1 min-w-0">
                                <div className="text-xs font-semibold text-slate-700 truncate">{prod.name}</div>
                                <div className="text-[9px] text-slate-400">{prod.w}G × {prod.d}D × {prod.h}Y cm</div>
                              </div>
                              <div className="flex gap-1.5 flex-shrink-0">
                                <a
                                  href={makeSearchUrl("trendyol", prod.searchQuery)}
                                  target="_blank" rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-orange-50 border border-orange-200 hover:bg-orange-100 text-[10px] font-semibold text-orange-700 transition"
                                  title={`"${prod.searchQuery}" Trendyol'da ara`}
                                >
                                  Trendyol
                                  <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                                </a>
                                <a
                                  href={makeSearchUrl("google", prod.searchQuery)}
                                  target="_blank" rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-blue-50 border border-blue-200 hover:bg-blue-100 text-[10px] font-semibold text-blue-700 transition"
                                  title={`"${prod.searchQuery}" Google'da ara`}
                                >
                                  Google
                                  <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                                </a>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}

                <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 text-[10px] text-amber-700 leading-relaxed">
                  💡 Arama sonuçlarında dolap ölçülerinizi (<strong>{cabSizes[0]?.w}×{cabSizes[0]?.d} cm</strong>) referans alarak ürün seçebilirsiniz.
                </div>
              </div>

              {/* Alt butonlar */}
              <div className="px-6 pb-6 pt-3 border-t border-slate-100 flex gap-2">
                <button
                  onClick={() => setShowBuyLinks(false)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
                >
                  Tasarıma Dön
                </button>
                <button
                  onClick={handleExportAR}
                  disabled={exporting}
                  className="flex-1 py-2.5 rounded-xl bg-primary text-white text-xs font-semibold hover:bg-blue-600 disabled:opacity-60 transition"
                >
                  {exporting ? "Hazırlanıyor..." : "AR'da Gör"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ─── SpacePlan — Kaldırıldı (Ürün Dene özelliği ModuPlan içine entegre edildi) ───

export default function ClientPage() {
  return <ModuPlanApp />;
}
