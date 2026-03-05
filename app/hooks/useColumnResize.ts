"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface UseColumnResizeOptions {
	defaultWidth: number;
	minWidth: number;
	maxWidth: number;
	storageKey?: string;
}

/**
 * Returns [width, dragHandleProps] for a resizable column.
 * Attach dragHandleProps to the drag-handle div.
 */
export function useColumnResize({
	defaultWidth,
	minWidth,
	maxWidth,
	storageKey,
}: UseColumnResizeOptions): [number, React.HTMLAttributes<HTMLDivElement>] {
	const [width, setWidth] = useState<number>(() => {
		if (storageKey && typeof window !== "undefined") {
			const stored = localStorage.getItem(storageKey);
			if (stored) {
				const n = Number(stored);
				if (!isNaN(n) && n >= minWidth && n <= maxWidth) return n;
			}
		}
		return defaultWidth;
	});

	const dragging = useRef(false);
	const startX = useRef(0);
	const startWidth = useRef(0);

	const onMouseDown = useCallback(
		(e: React.MouseEvent) => {
			e.preventDefault();
			dragging.current = true;
			startX.current = e.clientX;
			startWidth.current = width;
			document.body.style.cursor = "col-resize";
			document.body.style.userSelect = "none";
		},
		[width],
	);

	useEffect(() => {
		const onMouseMove = (e: MouseEvent) => {
			if (!dragging.current) return;
			const delta = e.clientX - startX.current;
			const next = Math.min(maxWidth, Math.max(minWidth, startWidth.current + delta));
			setWidth(next);
		};

		const onMouseUp = () => {
			if (!dragging.current) return;
			dragging.current = false;
			document.body.style.cursor = "";
			document.body.style.userSelect = "";
			// Persist
			if (storageKey) {
				localStorage.setItem(storageKey, String(startWidth.current + 0)); // will be updated next render
			}
		};

		window.addEventListener("mousemove", onMouseMove);
		window.addEventListener("mouseup", onMouseUp);
		return () => {
			window.removeEventListener("mousemove", onMouseMove);
			window.removeEventListener("mouseup", onMouseUp);
		};
	}, [minWidth, maxWidth, storageKey]);

	// Persist when width stabilises
	useEffect(() => {
		if (storageKey) {
			localStorage.setItem(storageKey, String(width));
		}
	}, [width, storageKey]);

	return [width, { onMouseDown }];
}
