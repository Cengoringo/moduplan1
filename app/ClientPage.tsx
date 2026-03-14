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

// ─── Ana Sayfa ────────────────────────────────────────────────────────────────

function ModuPlanApp() {
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
        <div className="flex items-center gap-2">
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
                const { product: prod, pos } = placedProduct;
                const pW = prod.w * CM_TO_M;
                const pH = prod.h * CM_TO_M;
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
                        // Ürüne tıklanınca sahnede dolabın önüne yerleştir
                        const firstCab = cabinets[0];
                        const startPos: [number, number, number] = firstCab
                          ? [firstCab.x, (room.height * firstCab.heightRatio * CM_TO_M) / 2, firstCab.z + (firstCab.depthFactor * room.height * firstCab.heightRatio * CM_TO_M) / 2 + 0.1]
                          : [0, prod.h * CM_TO_M / 2, 0.5];
                        if (placedProduct?.product.id === prod.id) {
                          // Zaten aynı ürün — kaldır
                          setPlacedProduct(null);
                          setTryProductId(null);
                        } else {
                          setPlacedProduct({ product: prod, pos: startPos });
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
                    {/* Hareket modu seçici */}
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
                    <div className="text-[9px] text-slate-500">
                      {productAxis === "xz"
                        ? "Ürünü sürükle → ileri/geri/yanlara taşır"
                        : "Ürünü sürükle → yukarı/aşağı taşır"}
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

              {/* Yanındakine Kilitle / Kilidi Aç */}
              <button
                type="button"
                onClick={lockSelectedToNeighbor}
                disabled={cabinets.length < 2}
                className={`w-full flex items-center justify-center gap-1.5 py-2 rounded-xl border text-xs font-medium transition disabled:opacity-50 disabled:cursor-not-allowed ${
                  selectedCab.lockedTo != null
                    ? "border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100"
                    : "border-slate-200 hover:bg-slate-50 text-slate-600"
                }`}
              >
                {selectedCab.lockedTo != null ? "🔒 Kilitli — Kilidi Aç" : "🔗 Yanındakine Kilitle"}
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
