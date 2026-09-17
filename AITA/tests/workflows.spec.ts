import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

async function login(
  page: Page,
  role: "teacher" | "student" | "management" = "teacher",
) {
  await page.goto("/");
  await page
    .getByRole("button", {
      name:
        role === "teacher"
          ? /Priya · Teacher/
          : role === "student"
            ? /Aarav · Student/
            : /Raj · Academic head/,
    })
    .click();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
}

test("teacher overview, batch filters, and weekly search", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await login(page);
  await expect(
    page.getByRole("heading", { name: "A clearer picture, Priya." }),
  ).toBeVisible();
  await expect(page.locator(".metric-card").first()).toContainText("16");
  await page.getByLabel("Batch", { exact: true }).selectOption("all");
  await expect(page.locator(".metric-card").first()).toContainText("23");
  await page.getByLabel("Analysis window").selectOption("8");
  await expect(
    page.getByRole("heading", { name: "Learning is moving forward" }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Weekly mistakes", exact: true })
    .click();
  await page.getByRole("searchbox").fill("Aarav");
  await expect(
    page.getByRole("row").filter({ hasText: "Aarav Mehta" }),
  ).toBeVisible();
  await expect(
    page.getByRole("row").filter({ hasText: "Riya Sharma" }),
  ).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("teacher assigns homework and student submits it", async ({ page }) => {
  await login(page);
  await page
    .getByRole("link", { name: "Weekly mistakes", exact: true })
    .click();
  const row = page.getByRole("row").filter({ hasText: "Aarav Mehta" });
  await row.getByRole("button", { name: "Assign remedial" }).click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("combobox", { name: "Student", exact: true }),
  ).toHaveValue("student-01");
  await dialog.getByLabel("Focus subtopic").selectOption("chem.org.carbonyls");
  await dialog
    .getByRole("button", { name: "Assign homework", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText("Homework assigned");
  await page.getByLabel("Switch demo profile").selectOption("student");
  await expect(
    page.getByRole("heading", { name: "Your next step, Aarav." }),
  ).toBeVisible();
  await page.getByRole("link", { name: "My homework", exact: true }).click();
  await page.getByRole("link", { name: "Start homework" }).first().click();
  await expect(page.locator(".worked-solution")).toHaveCount(0);
  await page.getByRole("radio").first().check();
  await page.getByRole("button", { name: "Submit answer" }).click();
  await expect(page.locator(".feedback-banner")).toBeVisible();
  await expect(page.locator(".worked-solution")).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Question 1", exact: true }).click();
  await expect(page.locator(".feedback-banner")).toBeVisible();
});

test("practice hides solutions and persists an attempt", async ({ page }) => {
  await login(page, "student");
  await page.getByRole("link", { name: "Practice queue", exact: true }).click();
  const first = page.locator(".practice-row").first();
  const href = await first.getAttribute("href");
  await first.click();
  await expect(page).toHaveURL(href!, { timeout: 15000 });
  await expect(page.locator(".solver")).toBeVisible();
  await expect(page.locator(".worked-solution")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Submit answer" }),
  ).toBeDisabled();
  await page.getByRole("radio").first().check();
  await page.getByRole("button", { name: "Submit answer" }).click();
  await expect(page.locator(".worked-solution")).toBeVisible();
  await page.goto(href!);
  await expect(page.locator(".feedback-banner")).toBeVisible();
  await expect(page.getByRole("button", { name: "Submit answer" })).toHaveCount(
    0,
  );
});

test("paper availability, creation, print view, and publishing", async ({
  page,
}) => {
  await login(page);
  await page
    .getByRole("link", { name: "Question papers", exact: true })
    .click();
  await page.getByRole("link", { name: "Build a paper", exact: true }).click();
  await page.getByRole("button", { name: "Check availability" }).click();
  await expect(
    page.getByRole("heading", { name: "Bank availability" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Create paper", exact: true }).click();
  await expect(page.locator(".paper-question")).toHaveCount(30);
  await expect(page.locator(".solution")).toHaveCount(0);
  await page.getByLabel("Include answer key and worked solutions").check();
  await expect(page.locator(".solution")).toHaveCount(30);
  await page.getByRole("button", { name: "Publish as test" }).click();
  await expect(page.getByRole("status")).toContainText("Paper published");
  await expect(
    page.getByRole("button", { name: "Publish as test" }),
  ).toHaveCount(0);
});

test("CSV preview is atomic and validates unknown students", async ({
  page,
}) => {
  await login(page);
  await page.getByRole("link", { name: "Import results", exact: true }).click();
  await page.getByLabel("Test", { exact: true }).selectOption("import-b1");
  await page
    .getByLabel("Upload results CSV")
    .setInputFiles({
      name: "invalid.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        "student_email,question_id,student_answer,time_taken_seconds\nunknown@example.test,q-01-01,A,40",
      ),
    });
  await page.getByRole("button", { name: "Validate & preview" }).click();
  await expect(page.locator(".error-state[role=alert]")).toContainText(
    "Nothing was saved",
  );
  await expect(
    page.getByRole("button", { name: /Confirm import/ }),
  ).toHaveCount(0);
  await page
    .getByLabel("Upload results CSV")
    .setInputFiles({
      name: "valid.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        "student_email,question_id,student_answer,time_taken_seconds\nstudent1@example.test,q-01-01,A,40",
      ),
    });
  await page.getByRole("button", { name: "Validate & preview" }).click();
  await expect(
    page.getByRole("heading", { name: "Looking good. Ready to import?" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Confirm import/ }),
  ).toBeVisible();
});

test("management reports, SQL disclosure, and blocked query audit", async ({
  page,
}) => {
  await login(page, "management");
  await page.getByRole("link", { name: "Ask Pragati", exact: true }).click();
  await page
    .locator(".suggested-questions")
    .getByRole("button", { name: /How many students are weak in Organic/ })
    .click();
  await expect(page.locator(".answer-text")).toContainText("active students");
  await page.getByText("Executed SQL & parameters", { exact: true }).click();
  await expect(page.locator("pre")).toContainText("SELECT COUNT(*)");
  await page.getByRole("button", { name: "Pin to overview" }).click();
  await expect(
    page.getByRole("button", { name: "Pinned", exact: true }),
  ).toBeDisabled();
  await page
    .getByLabel("Management question")
    .fill("Show me all student emails");
  await page.getByRole("button", { name: "Ask question", exact: true }).click();
  await expect(page.locator(".error-state[role=alert]")).toContainText(
    "Local mode supports",
  );
  await expect(
    page
      .locator(".history-list")
      .getByText("Blocked · unsupported local report")
      .first(),
  ).toBeVisible();
});

test("mobile navigation fits and keeps actions reachable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await expect(
    page.getByRole("button", { name: "Open navigation" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("link", { name: "Topic insights", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Know what to revisit." }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("dashboard has no WCAG A/AA violations", async ({ page }) => {
  await login(page);
  await expect(
    page.getByRole("heading", { name: "A clearer picture, Priya." }),
  ).toBeVisible();
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(results.violations).toEqual([]);
});
