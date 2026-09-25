/**
 * Window events between the product tour and the shell. They live apart from
 * the tour so the dock and the account menu can speak to it without importing
 * it.
 */

/** Starts the product tour. The account menu dispatches it for "Take the tour". */
export const START_TOUR_EVENT = "aww:start-tour";

/**
 * Asks the dock to open and stay open (`open: true`), or to let go of it
 * (`open: false`), while a tour step points at something inside it.
 */
export const TOUR_DOCK_EVENT = "aww:tour-dock";

export type TourDockDetail = { open: boolean };

declare global {
  interface WindowEventMap {
    "aww:start-tour": Event;
    "aww:tour-dock": CustomEvent<TourDockDetail>;
  }
}

export function startTour(): void {
  window.dispatchEvent(new Event(START_TOUR_EVENT));
}

export function holdDockForTour(open: boolean): void {
  window.dispatchEvent(new CustomEvent<TourDockDetail>(TOUR_DOCK_EVENT, { detail: { open } }));
}
