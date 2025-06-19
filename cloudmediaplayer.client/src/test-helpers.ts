import { DebugElement } from '@angular/core';
import { ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';

/**
 * Helper functions for testing
 */
export class TestHelpers {
  /**
   * Get element by selector
   */
  static getElement<T>(fixture: ComponentFixture<T>, selector: string): HTMLElement | null {
    const debugElement = fixture.debugElement.query(By.css(selector));
    return debugElement ? debugElement.nativeElement : null;
  }

  /**
   * Get all elements by selector
   */
  static getAllElements<T>(fixture: ComponentFixture<T>, selector: string): HTMLElement[] {
    const debugElements = fixture.debugElement.queryAll(By.css(selector));
    return debugElements.map(de => de.nativeElement);
  }

  /**
   * Click element by selector
   */
  static clickElement<T>(fixture: ComponentFixture<T>, selector: string): void {
    const element = this.getElement(fixture, selector);
    if (element) {
      element.click();
      fixture.detectChanges();
    }
  }

  /**
   * Set input value
   */
  static setInputValue<T>(fixture: ComponentFixture<T>, selector: string, value: string): void {
    const input = this.getElement(fixture, selector) as HTMLInputElement;
    if (input) {
      input.value = value;
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
    }
  }

  /**
   * Wait for async operations
   */
  static async waitForAsync(): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, 0));
  }

  /**
   * Create mock file for testing
   */
  static createMockFile(name: string, content: string = '', type: string = 'text/plain'): File {
    const blob = new Blob([content], { type });
    return new File([blob], name, { type });
  }

  /**
   * Create mock audio context
   */
  static createMockAudioContext(): jasmine.SpyObj<AudioContext> {
    return jasmine.createSpyObj('AudioContext', [
      'createBufferSource',
      'createGain',
      'decodeAudioData',
      'close'
    ]);
  }

  /**
   * Mock localStorage for testing
   */
  static mockLocalStorage(): { [key: string]: string } {
    const store: { [key: string]: string } = {};

    spyOn(localStorage, 'getItem').and.callFake((key: string) => store[key] || null);
    spyOn(localStorage, 'setItem').and.callFake((key: string, value: string) => {
      store[key] = value;
    });
    spyOn(localStorage, 'removeItem').and.callFake((key: string) => {
      delete store[key];
    });
    spyOn(localStorage, 'clear').and.callFake(() => {
      Object.keys(store).forEach(key => delete store[key]);
    });

    return store;
  }

  /**
   * Mock sessionStorage for testing
   */
  static mockSessionStorage(): { [key: string]: string } {
    const store: { [key: string]: string } = {};

    spyOn(sessionStorage, 'getItem').and.callFake((key: string) => store[key] || null);
    spyOn(sessionStorage, 'setItem').and.callFake((key: string, value: string) => {
      store[key] = value;
    });
    spyOn(sessionStorage, 'removeItem').and.callFake((key: string) => {
      delete store[key];
    });
    spyOn(sessionStorage, 'clear').and.callFake(() => {
      Object.keys(store).forEach(key => delete store[key]);
    });

    return store;
  }
}
