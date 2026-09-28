import { test, expect } from "@playwright/test";

/**
 * Unauthenticated checks only — no seeded admin credentials are available
 * to this test (PARADA_SEED_ADMIN_PASSWORD is not committed). Covers the
 * login page's split layout and the auth-guard redirect, both of
 * which don't require signing in.
 */

test.describe("Login page", () => {
  test("renders the split layout with brand panel on desktop", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/login");

    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();

    // Brand column (hidden below lg) should be visible at this width; the
    // mobile logo lockup (lg:hidden) stays in the DOM but hidden — two
    // <img alt="PARADA"> exist, so scope to each explicitly rather than a
    // bare getByAltText (which trips Playwright's strict-mode ambiguity).
    await expect(page.getByText("Guiding every vehicle to its zone.")).toBeVisible();
    const logos = page.getByAltText("PARADA");
    await expect(logos.first()).toBeHidden();
    await expect(logos.last()).toBeVisible();

    await page.screenshot({ path: "e2e/screenshots/login-dark-desktop.png", fullPage: true });
  });

  test("renders correctly in light mode", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.addInitScript(() => {
      window.localStorage.setItem("parada-theme", "light");
    });
    await page.goto("/login");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await page.screenshot({ path: "e2e/screenshots/login-light-desktop.png", fullPage: true });
  });

  test("collapses the brand panel below the lg breakpoint", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/login");

    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    // Brand panel is lg:flex hidden — the mobile logo lockup should show instead.
    await expect(page.getByText("Guiding every vehicle to its zone.")).toBeHidden();
    await expect(page.getByText("Operations console")).toBeVisible();

    await page.screenshot({ path: "e2e/screenshots/login-mobile.png", fullPage: true });
  });

  test("rejects an empty submit without a network call (native required validation)", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: /sign in/i }).click();
    // Native HTML5 validation blocks submit; we should still be on /login.
    await expect(page).toHaveURL(/\/login$/);
  });
});

test.describe("Auth guard", () => {
  // AppShell renders an inline "Admin access required" gate in place (it does
  // not navigate away) — router.replace("/login") only fires from signOut().
  test("shows the inline access-required gate on the dashboard when unauthenticated", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Admin access required" })).toBeVisible();
    await expect(page.getByRole("link", { name: /sign in/i })).toHaveAttribute("href", "/login");
    await expect(page).toHaveURL(/\/$/);
  });

  test("shows the same gate on a deep route when unauthenticated", async ({ page }) => {
    await page.goto("/zones");
    await expect(page.getByRole("heading", { name: "Admin access required" })).toBeVisible();
  });
});
