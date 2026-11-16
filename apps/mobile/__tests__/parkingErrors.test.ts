import { ApiError } from "@/lib/api/client";
import { parkingErrorMessage } from "@/lib/parkingErrors";

describe("parkingErrorMessage: one plan at a time", () => {
  const error = new ApiError("ACTIVE_PLAN_EXISTS", "You already have an assigned zone. Cancel it before reserving a space.", 409);

  it("shows the backend's message when reserving over an assignment", () => {
    expect(parkingErrorMessage(error, "reserve", "Zone A")).toBe(error.message);
  });

  it("shows the backend's message when assigning over a reservation", () => {
    expect(parkingErrorMessage(error, "assign", "Zone A")).toBe(error.message);
  });

  it("keeps the generic reserve conflict message for other conflicts", () => {
    expect(parkingErrorMessage(new ApiError("CONFLICT", "x", 409), "reserve", "Zone A")).toMatch(/can't take this reservation/);
  });
});
