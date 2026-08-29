import "dotenv/config";

const url = process.env["DATABASE_URL"] ?? "";
if (!url.includes("parada_test_api")) {
  throw new Error(
    "Refusing to run @parada/api tests against a non-test database. " +
      "Set DATABASE_URL to the parada_test_api database."
  );
}
