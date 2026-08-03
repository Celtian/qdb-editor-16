import { Overlay } from '@angular/cdk/overlay';
import type { OverlayRef } from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';
import { Injector, Service, inject } from '@angular/core';
import type { ComponentRef } from '@angular/core';

import { Confetti } from './confetti';
import type { ConfettiBurstOptions } from './confetti.types';

const confettiZIndex = 1_000_000_000;

@Service()
export class ConfettiService {
  private readonly injector = inject(Injector);
  private readonly overlay = inject(Overlay);
  private overlayRef?: OverlayRef;
  private componentRef?: ComponentRef<Confetti>;

  burst(options: ConfettiBurstOptions = {}): void {
    this.ensureConfetti().instance.burst(options);
  }

  celebrate(options: ConfettiBurstOptions = {}): void {
    this.burst({
      particleCount: 120,
      spread: 80,
      startVelocity: 28,
      ...options,
    });

    globalThis.setTimeout(() => {
      this.burst({
        particleCount: 70,
        origin: { x: 0.25, y: 0.45 },
        spread: 65,
        startVelocity: 22,
        ...options,
      });
    }, 140);

    globalThis.setTimeout(() => {
      this.burst({
        particleCount: 70,
        origin: { x: 0.75, y: 0.45 },
        spread: 65,
        startVelocity: 22,
        ...options,
      });
    }, 260);
  }

  clear(): void {
    this.componentRef?.instance.clear();
  }

  dispose(): void {
    this.overlayRef?.dispose();
    this.overlayRef = undefined;
    this.componentRef = undefined;
  }

  private ensureConfetti(): ComponentRef<Confetti> {
    if (this.componentRef) return this.componentRef;

    this.overlayRef = this.overlay.create({
      hasBackdrop: false,
      panelClass: 'confetti-overlay-pane',
      positionStrategy: this.overlay.position().global().top('0').left('0'),
      scrollStrategy: this.overlay.scrollStrategies.noop(),
      width: '100vw',
      height: '100vh',
    });
    this.overlayRef.hostElement.style.zIndex = `${confettiZIndex}`;
    this.overlayRef.overlayElement.style.zIndex = `${confettiZIndex}`;
    this.componentRef = this.overlayRef.attach(new ComponentPortal(Confetti, null, this.injector));

    return this.componentRef;
  }
}
