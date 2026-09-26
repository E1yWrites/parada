/**
 * Pre-audit remediation flows on mobile: email verification, forgot/reset
 * password, change password, profile (name/username/email/phone), avatar,
 * vehicle edit/unregister and accepted-assignment cancellation. The API is
 * mocked at the client boundary; every screen only renders what the (mocked)
 * server confirms.
 */
import { __router, useLocalSearchParams } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { Alert, Linking } from "react-native";
import { fireEvent, renderWithAppProviders, renderWithProviders, screen, waitFor } from "@/src/test/utils";
import type { Vehicle, ZoneAssignmentResponse } from "@parada/types";
import VerifyEmailScreen from "@/app/verify-email";
import ForgotPasswordScreen from "@/app/forgot-password";
import ResetPasswordScreen from "@/app/reset-password";
import ChangePasswordScreen from "@/app/account/password";
import EditProfileScreen from "@/app/account/profile";
import VehicleDetailScreen from "@/app/vehicles/[id]";
import ParkingScreen from "@/app/(tabs)/parking";
import { Avatar } from "@/src/components/Avatar";
import { AvatarEditor } from "@/src/components/AvatarEditor";
import { api, ApiError, avatarUrl, type PublicZone, type UserDto } from "@/lib/api/client";
import { getToken } from "@/lib/auth/session";
import { resolveZoneDestination } from "@/lib/navigation";

jest.mock("@/lib/api/client", () => {
  const actual = jest.requireActual("@/lib/api/client");
  return {
    ...actual,
    api: {
      me: jest.fn(),
      login: jest.fn(),
      register: jest.fn(),
      logout: jest.fn(),
      verifyEmail: jest.fn(),
      resendVerification: jest.fn(),
      forgotPassword: jest.fn(),
      resetPassword: jest.fn(),
      changePassword: jest.fn(),
      updateProfile: jest.fn(),
      requestEmailChange: jest.fn(),
      confirmEmailChange: jest.fn(),
      cancelEmailChange: jest.fn(),
      requestPhoneChange: jest.fn(),
      clearPhone: jest.fn(),
      confirmPhoneChange: jest.fn(),
      uploadAvatar: jest.fn(),
      removeAvatar: jest.fn(),
      zones: jest.fn(),
      zoneOccupancy: jest.fn(),
      recommendedZone: jest.fn(),
      assignments: jest.fn(),
      createAssignment: jest.fn(),
      cancelAssignment: jest.fn(),
      reservations: jest.fn(),
      createReservation: jest.fn(),
      cancelReservation: jest.fn(),
      vehicles: jest.fn(),
      createVehicle: jest.fn(),
      updateVehicle: jest.fn(),
      setPrimaryVehicle: jest.fn(),
      unregisterVehicle: jest.fn(),
      sessions: jest.fn(),
      activeSession: jest.fn(),
      notifications: jest.fn(),
      markNotificationRead: jest.fn(),
      violations: jest.fn(),
      appealViolation: jest.fn(),
    },
  };
});

jest.mock("@/lib/avatar", () => ({
  ...jest.requireActual("@/lib/avatar"),
  pickAvatarImage: jest.fn(),
  prepareAvatarUpload: jest.fn(),
}));

const user: UserDto = {
  id: "u1",
  name: "Alex Driver",
  email: "alex@parada.test",
  username: null,
  phone: null,
  role: "USER",
  status: "ACTIVE",
  emailVerifiedAt: "2026-01-01T00:00:00.000Z",
  pendingEmail: null,
  pendingPhone: null,
  avatarUpdatedAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
};

const vehicle: Vehicle = {
  id: "v1",
  userId: "u1",
  plateNumber: "ABC-1234",
  normalizedPlate: "ABC1234",
  vehicleType: "CAR",
  make: "Toyota",
  model: "Vios",
  color: null,
  status: "ACTIVE",
  isPrimary: true,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

const zones: PublicZone[] = [
  {
    id: "z1",
    name: "Zone A",
    code: "A",
    description: null,
    capacity: 20,
    occupiedCount: 10,
    availableCount: 10,
    status: "ACTIVE",
    availability: "AVAILABLE",
    navigationLat: 13.76447,
    navigationLng: 121.06462,
  },
  {
    id: "z2",
    name: "Zone B",
    code: "B",
    description: null,
    capacity: 20,
    occupiedCount: 10,
    availableCount: 10,
    status: "ACTIVE",
    availability: "AVAILABLE",
    navigationLat: null,
    navigationLng: null,
  },
];

const assignment: ZoneAssignmentResponse = {
  id: "as1",
  userId: "u1",
  vehicleId: "v1",
  zoneId: "z1",
  status: "ACTIVE",
  assignedAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  zone: { id: "z1", name: "Zone A", code: "A" },
  vehicle: { id: "v1", plateNumber: "ABC-1234", vehicleType: "CAR" },
};

async function signedIn() {
  await SecureStore.setItemAsync("parada.session.token", "tok-alive");
  (api.me as jest.Mock).mockResolvedValue(user);
}

beforeEach(() => {
  jest.clearAllMocks();
  (SecureStore as typeof SecureStore & { __reset: () => void }).__reset();
  (useLocalSearchParams as jest.Mock).mockReturnValue({});
  (api.zones as jest.Mock).mockResolvedValue(zones);
  (api.activeSession as jest.Mock).mockResolvedValue(null);
  (api.assignments as jest.Mock).mockResolvedValue([]);
  (api.reservations as jest.Mock).mockResolvedValue([]);
  (api.vehicles as jest.Mock).mockResolvedValue([vehicle]);
  (api.notifications as jest.Mock).mockResolvedValue({ notifications: [], unreadCount: 0 });
  (api.recommendedZone as jest.Mock).mockResolvedValue({ recommendedZone: null });
});

// ---------------------------------------------------------------------------

describe("verify-email screen", () => {
  beforeEach(() => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ email: "alex@parada.test" });
  });

  it("submits the 6-digit code and returns to login with a verified notice", async () => {
    (api.verifyEmail as jest.Mock).mockResolvedValue({ user });
    renderWithAppProviders(<VerifyEmailScreen />);
    expect(screen.getByTestId("verify-email-address")).toHaveTextContent(/alex@parada\.test/);
    expect(screen.getByTestId("verify-email-submit")).toBeDisabled();

    fireEvent.changeText(screen.getByTestId("verify-email-code"), "12a345x6");
    fireEvent.press(screen.getByTestId("verify-email-submit"));

    await waitFor(() => expect(api.verifyEmail).toHaveBeenCalledWith("alex@parada.test", "123456"));
    await waitFor(() =>
      expect(__router.replace).toHaveBeenCalledWith({
        pathname: "/login",
        params: { email: "alex@parada.test", notice: "verified" },
      }),
    );
    await expect(getToken()).resolves.toBeNull();
  });

  it("shows the server's invalid/expired-code message and stays on the screen", async () => {
    (api.verifyEmail as jest.Mock).mockRejectedValue(new ApiError("CODE_EXPIRED", "That code has expired. Request a new one.", 422));
    renderWithAppProviders(<VerifyEmailScreen />);
    fireEvent.changeText(screen.getByTestId("verify-email-code"), "123456");
    fireEvent.press(screen.getByTestId("verify-email-submit"));
    await waitFor(() => expect(screen.getByTestId("verify-email-error")).toHaveTextContent(/That code has expired\./));
    expect(__router.replace).not.toHaveBeenCalled();
  });

  it("resends the code and enforces the server's cooldown", async () => {
    (api.resendVerification as jest.Mock).mockResolvedValue({
      verification: { expiresAt: new Date(Date.now() + 600_000).toISOString(), resendAvailableAt: new Date(Date.now() + 60_000).toISOString() },
    });
    renderWithAppProviders(<VerifyEmailScreen />);
    fireEvent.press(screen.getByTestId("verify-email-resend"));
    await waitFor(() => expect(api.resendVerification).toHaveBeenCalledWith("alex@parada.test"));
    await waitFor(() => expect(screen.getByTestId("verify-email-resend")).toBeDisabled());
    expect(screen.getByTestId("verify-email-resend")).toHaveTextContent(/Resend code in \d+s/);
    expect(screen.getByTestId("verify-email-notice")).toBeOnTheScreen();
  });

  it("honours a 429 cooldown from the server", async () => {
    (api.resendVerification as jest.Mock).mockRejectedValue(
      new ApiError("TOO_MANY_REQUESTS", "Please wait before requesting another code.", 429, {
        resendAvailableAt: new Date(Date.now() + 45_000).toISOString(),
      }),
    );
    renderWithAppProviders(<VerifyEmailScreen />);
    fireEvent.press(screen.getByTestId("verify-email-resend"));
    await waitFor(() => expect(screen.getByTestId("verify-email-error")).toHaveTextContent(/Please wait/));
    expect(screen.getByTestId("verify-email-resend")).toBeDisabled();
  });
});

describe("forgot / reset password screens", () => {
  it("requests a reset link and shows the generic confirmation", async () => {
    (api.forgotPassword as jest.Mock).mockResolvedValue({ message: "ok" });
    renderWithAppProviders(<ForgotPasswordScreen />);
    fireEvent.changeText(screen.getByTestId("forgot-password-email"), "alex@parada.test");
    fireEvent.press(screen.getByTestId("forgot-password-submit"));
    await waitFor(() => expect(api.forgotPassword).toHaveBeenCalledWith("alex@parada.test"));
    expect(screen.getByTestId("forgot-password-sent")).toHaveTextContent(/If an account exists/);
  });

  it("prefills the token from the deep link, validates locally, resets and returns to login", async () => {
    const token = "a".repeat(64);
    (useLocalSearchParams as jest.Mock).mockReturnValue({ token });
    (api.resetPassword as jest.Mock).mockResolvedValue({ user });
    renderWithAppProviders(<ResetPasswordScreen />);
    expect(screen.getByTestId("reset-password-token").props.value).toBe(token);

    fireEvent.changeText(screen.getByTestId("reset-password-new"), "NewPassword1");
    fireEvent.changeText(screen.getByTestId("reset-password-confirm"), "different");
    fireEvent.press(screen.getByTestId("reset-password-submit"));
    expect(screen.getByText("Passwords do not match.")).toBeOnTheScreen();
    expect(api.resetPassword).not.toHaveBeenCalled();

    fireEvent.changeText(screen.getByTestId("reset-password-confirm"), "NewPassword1");
    fireEvent.press(screen.getByTestId("reset-password-submit"));
    await waitFor(() => expect(api.resetPassword).toHaveBeenCalledWith(token, "NewPassword1"));
    await waitFor(() => expect(__router.replace).toHaveBeenCalledWith({ pathname: "/login", params: { notice: "reset" } }));
  });

  it("surfaces an invalid / used token", async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ token: "b".repeat(64) });
    (api.resetPassword as jest.Mock).mockRejectedValue(new ApiError("TOKEN_INVALID", "This reset link is invalid or has already been used.", 422));
    renderWithAppProviders(<ResetPasswordScreen />);
    fireEvent.changeText(screen.getByTestId("reset-password-new"), "NewPassword1");
    fireEvent.changeText(screen.getByTestId("reset-password-confirm"), "NewPassword1");
    fireEvent.press(screen.getByTestId("reset-password-submit"));
    await waitFor(() => expect(screen.getByTestId("reset-password-error")).toHaveTextContent(/already been used/));
  });
});

describe("change password screen", () => {
  it("requires current password + matching confirmation, then swaps in the fresh token", async () => {
    await signedIn();
    (api.changePassword as jest.Mock).mockResolvedValue({ user, token: "tok-fresh" });
    renderWithAppProviders(<ChangePasswordScreen />);

    fireEvent.press(screen.getByTestId("password-submit"));
    expect(screen.getByText("Enter your current password.")).toBeOnTheScreen();
    expect(api.changePassword).not.toHaveBeenCalled();

    fireEvent.changeText(screen.getByTestId("password-current"), "OldPassword1");
    fireEvent.changeText(screen.getByTestId("password-new"), "NewPassword1");
    fireEvent.changeText(screen.getByTestId("password-confirm"), "NewPassword1");
    fireEvent.press(screen.getByTestId("password-submit"));

    await waitFor(() => expect(api.changePassword).toHaveBeenCalledWith("OldPassword1", "NewPassword1"));
    await waitFor(() => expect(screen.getByTestId("password-done")).toBeOnTheScreen());
    await expect(getToken()).resolves.toBe("tok-fresh");
  });

  it("shows the server's wrong-current-password error", async () => {
    await signedIn();
    (api.changePassword as jest.Mock).mockRejectedValue(new ApiError("UNPROCESSABLE", "Your current password is incorrect.", 422));
    renderWithAppProviders(<ChangePasswordScreen />);
    fireEvent.changeText(screen.getByTestId("password-current"), "wrong-one");
    fireEvent.changeText(screen.getByTestId("password-new"), "NewPassword1");
    fireEvent.changeText(screen.getByTestId("password-confirm"), "NewPassword1");
    fireEvent.press(screen.getByTestId("password-submit"));
    await waitFor(() => expect(screen.getByTestId("password-error")).toHaveTextContent(/current password is incorrect/));
    await expect(getToken()).resolves.toBe("tok-alive");
  });
});

describe("edit profile screen", () => {
  it("saves name + username and shows the server response", async () => {
    await signedIn();
    (api.updateProfile as jest.Mock).mockResolvedValue({ ...user, name: "Alexis Driver", username: "alexis" });
    renderWithAppProviders(<EditProfileScreen />);
    await waitFor(() => expect(screen.getByTestId("profile-name")).toBeOnTheScreen());
    expect(screen.getByTestId("profile-name-save")).toBeDisabled();

    fireEvent.changeText(screen.getByTestId("profile-name"), "Alexis Driver");
    fireEvent.changeText(screen.getByTestId("profile-username"), "Alexis");
    fireEvent.press(screen.getByTestId("profile-name-save"));

    await waitFor(() => expect(api.updateProfile).toHaveBeenCalledWith({ name: "Alexis Driver", username: "alexis" }));
    await waitFor(() => expect(screen.getByTestId("profile-name-saved")).toBeOnTheScreen());
  });

  it("shows a taken-username conflict from the server", async () => {
    await signedIn();
    (api.updateProfile as jest.Mock).mockRejectedValue(new ApiError("CONFLICT", "That username is already taken.", 409));
    renderWithAppProviders(<EditProfileScreen />);
    await waitFor(() => expect(screen.getByTestId("profile-username")).toBeOnTheScreen());
    fireEvent.changeText(screen.getByTestId("profile-username"), "taken");
    fireEvent.press(screen.getByTestId("profile-name-save"));
    await waitFor(() => expect(screen.getByText("That username is already taken.")).toBeOnTheScreen());
  });

  it("changes email in two steps: request code to the new address, then confirm", async () => {
    await signedIn();
    (api.requestEmailChange as jest.Mock).mockResolvedValue({
      verification: { expiresAt: new Date(Date.now() + 600_000).toISOString(), resendAvailableAt: new Date(Date.now() + 60_000).toISOString() },
    });
    (api.confirmEmailChange as jest.Mock).mockResolvedValue({ ...user, email: "new@parada.test", pendingEmail: null });
    renderWithAppProviders(<EditProfileScreen />);
    await waitFor(() => expect(screen.getByTestId("profile-email-new")).toBeOnTheScreen());

    fireEvent.changeText(screen.getByTestId("profile-email-new"), "New@parada.test");
    fireEvent.press(screen.getByTestId("profile-email-request"));
    await waitFor(() => expect(api.requestEmailChange).toHaveBeenCalledWith("New@parada.test"));
    await waitFor(() => expect(screen.getByTestId("profile-email-pending")).toHaveTextContent(/new@parada\.test/));
    // Until confirmed the current email stays authoritative.
    expect(screen.getByTestId("profile-email-current")).toHaveTextContent(/alex@parada\.test/);
    expect(screen.getByTestId("profile-email-resend")).toBeDisabled();

    fireEvent.changeText(screen.getByTestId("profile-email-code"), "654321");
    fireEvent.press(screen.getByTestId("profile-email-confirm"));
    await waitFor(() => expect(api.confirmEmailChange).toHaveBeenCalledWith("654321"));
    await waitFor(() => expect(screen.getByTestId("profile-email-current")).toHaveTextContent(/new@parada\.test/));
    expect(screen.queryByTestId("profile-email-pending")).toBeNull();
  });

  it("changes phone in two steps and can clear it", async () => {
    await signedIn();
    (api.requestPhoneChange as jest.Mock).mockResolvedValue({
      verification: { expiresAt: new Date(Date.now() + 600_000).toISOString(), resendAvailableAt: new Date(Date.now() + 60_000).toISOString() },
    });
    (api.confirmPhoneChange as jest.Mock).mockResolvedValue({ ...user, phone: "+639171234567", pendingPhone: null });
    (api.clearPhone as jest.Mock).mockResolvedValue({ user: { ...user, phone: null } });
    renderWithAppProviders(<EditProfileScreen />);
    await waitFor(() => expect(screen.getByTestId("profile-phone-new")).toBeOnTheScreen());

    fireEvent.changeText(screen.getByTestId("profile-phone-new"), "+63 917 123 4567");
    fireEvent.press(screen.getByTestId("profile-phone-request"));
    await waitFor(() => expect(api.requestPhoneChange).toHaveBeenCalledWith("+63 917 123 4567"));
    await waitFor(() => expect(screen.getByTestId("profile-phone-pending")).toHaveTextContent(/\+639171234567/));

    fireEvent.changeText(screen.getByTestId("profile-phone-code"), "111222");
    fireEvent.press(screen.getByTestId("profile-phone-confirm"));
    await waitFor(() => expect(api.confirmPhoneChange).toHaveBeenCalledWith("111222"));
    await waitFor(() => expect(screen.getByTestId("profile-phone-current")).toHaveTextContent(/\+639171234567/));

    fireEvent.press(screen.getByTestId("profile-phone-clear"));
    await waitFor(() => expect(api.clearPhone).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByTestId("profile-phone-current")).toHaveTextContent(/Not set/));
  });
});

describe("profile picture", () => {
  const avatarLib = jest.requireMock("@/lib/avatar") as {
    pickAvatarImage: jest.Mock;
    prepareAvatarUpload: jest.Mock;
  };

  it("renders initials without a picture and the authenticated image URL with one", () => {
    renderWithProviders(<Avatar name="Alex Driver" uri={null} authToken="tok" testID="av" />);
    expect(screen.getByText("AD")).toBeOnTheScreen();
    expect(screen.queryByTestId("av-image")).toBeNull();
    screen.unmount();

    const withPhoto = { ...user, avatarUpdatedAt: "2026-02-02T00:00:00.000Z" };
    const uri = avatarUrl(withPhoto)!;
    expect(uri).toContain(`/users/${user.id}/avatar?v=`);
    renderWithProviders(<Avatar name="Alex Driver" uri={uri} authToken="tok" testID="av" />);
    const image = screen.getByTestId("av-image");
    expect(image.props.source).toEqual({ uri, headers: { Authorization: "Bearer tok" } });
    expect(avatarUrl(user)).toBeNull();
  });

  it("picks, prepares (crop/resize/compress) and uploads; the server response replaces the account", async () => {
    await signedIn();
    avatarLib.pickAvatarImage.mockResolvedValue({ uri: "file:///pick.jpg", width: 1200, height: 800 });
    const blob = new Blob(["jpeg"], { type: "image/jpeg" });
    avatarLib.prepareAvatarUpload.mockResolvedValue({ blob, contentType: "image/jpeg", uri: "file:///out.jpg" });
    const updated = { ...user, avatarUpdatedAt: "2026-03-03T00:00:00.000Z" };
    (api.uploadAvatar as jest.Mock).mockResolvedValue(updated);
    (api.removeAvatar as jest.Mock).mockResolvedValue(user);

    renderWithAppProviders(<AvatarEditor user={user} testID="ed" />);
    expect(screen.queryByTestId("ed-remove")).toBeNull();
    fireEvent.press(screen.getByTestId("ed-gallery"));
    await waitFor(() => expect(avatarLib.pickAvatarImage).toHaveBeenCalledWith("gallery"));
    await waitFor(() => expect(avatarLib.prepareAvatarUpload).toHaveBeenCalledWith({ uri: "file:///pick.jpg", width: 1200, height: 800 }));
    await waitFor(() => expect(api.uploadAvatar).toHaveBeenCalledWith(blob, "image/jpeg"));
  });

  it("shows friendly failure states for permission denial and upload rejection", async () => {
    await signedIn();
    const { AvatarPickError } = jest.requireActual("@/lib/avatar") as typeof import("@/lib/avatar");
    avatarLib.pickAvatarImage.mockRejectedValueOnce(new AvatarPickError("permission-denied", "Camera access is required to take a profile photo."));
    renderWithAppProviders(<AvatarEditor user={user} testID="ed" />);
    fireEvent.press(screen.getByTestId("ed-camera"));
    await waitFor(() => expect(screen.getByTestId("ed-error")).toHaveTextContent(/Camera access is required/));

    avatarLib.pickAvatarImage.mockResolvedValueOnce({ uri: "file:///pick.jpg", width: 100, height: 100 });
    avatarLib.prepareAvatarUpload.mockResolvedValueOnce({ blob: new Blob(["x"]), contentType: "image/jpeg", uri: "file:///o.jpg" });
    (api.uploadAvatar as jest.Mock).mockRejectedValueOnce(new ApiError("UNPROCESSABLE", "Profile pictures must be a JPEG, PNG or WebP image.", 422));
    fireEvent.press(screen.getByTestId("ed-gallery"));
    await waitFor(() => expect(screen.getByTestId("ed-error")).toHaveTextContent(/JPEG, PNG or WebP/));
  });

  it("cancelling the picker leaves the account untouched", async () => {
    await signedIn();
    avatarLib.pickAvatarImage.mockResolvedValue(null);
    renderWithAppProviders(<AvatarEditor user={user} testID="ed" />);
    fireEvent.press(screen.getByTestId("ed-gallery"));
    await waitFor(() => expect(avatarLib.pickAvatarImage).toHaveBeenCalled());
    expect(api.uploadAvatar).not.toHaveBeenCalled();
    expect(screen.queryByTestId("ed-error")).toBeNull();
  });
});

describe("vehicle edit / unregister screen", () => {
  beforeEach(() => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ id: "v1" });
  });

  it("edits details and plate through the API", async () => {
    (api.updateVehicle as jest.Mock).mockResolvedValue({ ...vehicle, color: "Red", plateNumber: "XYZ-999", normalizedPlate: "XYZ999" });
    renderWithProviders(<VehicleDetailScreen />);
    await waitFor(() => expect(screen.getByTestId("vehicle-edit-form")).toBeOnTheScreen());
    expect(screen.getByTestId("vehicle-edit-save")).toBeDisabled();

    fireEvent.changeText(screen.getByTestId("vehicle-edit-color"), "Red");
    fireEvent.changeText(screen.getByTestId("vehicle-edit-plate"), "XYZ-999");
    fireEvent.press(screen.getByTestId("vehicle-edit-save"));

    await waitFor(() =>
      expect(api.updateVehicle).toHaveBeenCalledWith("v1", {
        vehicleType: "CAR",
        make: "Toyota",
        model: "Vios",
        color: "Red",
        plateNumber: "XYZ-999",
      }),
    );
    await waitFor(() => expect(screen.getByTestId("vehicle-edit-saved")).toBeOnTheScreen());
  });

  it("shows the domain conflict when the plate cannot change while in use", async () => {
    (api.updateVehicle as jest.Mock).mockRejectedValue(
      new ApiError("CONFLICT", "You cannot change the plate number of a vehicle with an active zone assignment. Cancel the assignment first.", 409),
    );
    renderWithProviders(<VehicleDetailScreen />);
    await waitFor(() => expect(screen.getByTestId("vehicle-edit-plate")).toBeOnTheScreen());
    fireEvent.changeText(screen.getByTestId("vehicle-edit-plate"), "NEW-1");
    fireEvent.press(screen.getByTestId("vehicle-edit-save"));
    await waitFor(() => expect(screen.getByText(/Cancel the assignment first/)).toBeOnTheScreen());
  });

  it("confirms before unregistering, then removes the vehicle and goes back", async () => {
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation((_t, _m, buttons) => {
      const confirm = buttons?.find((b) => b.style === "destructive");
      confirm?.onPress?.();
    });
    (api.unregisterVehicle as jest.Mock).mockResolvedValue({ ...vehicle, status: "INACTIVE" });
    renderWithProviders(<VehicleDetailScreen />);
    await waitFor(() => expect(screen.getByTestId("vehicle-unregister")).toBeOnTheScreen());
    fireEvent.press(screen.getByTestId("vehicle-unregister"));
    expect(alertSpy).toHaveBeenCalled();
    await waitFor(() => expect(api.unregisterVehicle).toHaveBeenCalledWith("v1"));
    await waitFor(() => expect(__router.back).toHaveBeenCalled());
    alertSpy.mockRestore();
  });

  it("offers to set a non-primary active vehicle as primary, and reflects the switch", async () => {
    (api.vehicles as jest.Mock)
      .mockResolvedValueOnce([{ ...vehicle, isPrimary: false }])
      .mockResolvedValue([{ ...vehicle, isPrimary: true }]);
    (api.setPrimaryVehicle as jest.Mock).mockResolvedValue({ ...vehicle, isPrimary: true });
    renderWithProviders(<VehicleDetailScreen />);

    await waitFor(() => expect(screen.getByTestId("vehicle-make-primary")).toBeOnTheScreen());
    expect(screen.queryByTestId("vehicle-is-primary")).not.toBeOnTheScreen();

    fireEvent.press(screen.getByTestId("vehicle-make-primary"));

    await waitFor(() => expect(api.setPrimaryVehicle).toHaveBeenCalledWith("v1"));
    await waitFor(() => expect(screen.getByTestId("vehicle-is-primary")).toBeOnTheScreen());
    expect(screen.queryByTestId("vehicle-make-primary")).not.toBeOnTheScreen();
  });

  it("shows the domain block when the vehicle is parked / reserved", async () => {
    jest.spyOn(Alert, "alert").mockImplementation((_t, _m, buttons) => {
      buttons?.find((b) => b.style === "destructive")?.onPress?.();
    });
    (api.unregisterVehicle as jest.Mock).mockRejectedValue(
      new ApiError("CONFLICT", "You cannot unregister a vehicle with an active parking session.", 409, { reason: "ACTIVE_SESSION" }),
    );
    renderWithProviders(<VehicleDetailScreen />);
    await waitFor(() => expect(screen.getByTestId("vehicle-unregister")).toBeOnTheScreen());
    fireEvent.press(screen.getByTestId("vehicle-unregister"));
    await waitFor(() => expect(screen.getByText(/active parking session/)).toBeOnTheScreen());
    expect(__router.back).not.toHaveBeenCalled();
  });
});

describe("accepted recommendation: cancel from the parking screen", () => {
  it("cancels through the API and the current state falls back to 'Nothing planned'", async () => {
    (api.assignments as jest.Mock).mockResolvedValue([assignment]);
    (api.cancelAssignment as jest.Mock).mockImplementation(async (id: string) => {
      (api.assignments as jest.Mock).mockResolvedValue([{ ...assignment, status: "CANCELLED" }]);
      return { ...assignment, id, status: "CANCELLED" };
    });
    renderWithProviders(<ParkingScreen />);
    await waitFor(() => expect(screen.getByTestId("assignment-current")).toBeOnTheScreen());
    expect(screen.getByText("You can cancel until your vehicle enters the zone.")).toBeOnTheScreen();

    fireEvent.press(screen.getByTestId("assignment-cancel"));
    await waitFor(() => expect(api.cancelAssignment).toHaveBeenCalledWith("as1"));
    await waitFor(() => expect(screen.queryByTestId("assignment-current")).toBeNull());
    expect(screen.getByTestId("current-state-empty")).toBeOnTheScreen();
    // Nothing else was mutated: no reservation, no session.
    expect(api.cancelReservation).not.toHaveBeenCalled();
    expect(api.createReservation).not.toHaveBeenCalled();
  });

  it("keeps the assignment and shows the server's reason when cancellation is refused after entry", async () => {
    (api.assignments as jest.Mock).mockResolvedValue([assignment]);
    (api.cancelAssignment as jest.Mock).mockRejectedValue(
      new ApiError("CONFLICT", "This vehicle has already entered the parking area; the assignment can no longer be cancelled.", 409),
    );
    renderWithProviders(<ParkingScreen />);
    await waitFor(() => expect(screen.getByTestId("assignment-current")).toBeOnTheScreen());
    fireEvent.press(screen.getByTestId("assignment-cancel"));
    await waitFor(() => expect(screen.getByTestId("assignment-cancel-error")).toHaveTextContent(/already entered/));
    expect(screen.getByTestId("assignment-current")).toBeOnTheScreen();
  });

  it("does not offer cancellation once a parking session is active", async () => {
    (api.assignments as jest.Mock).mockResolvedValue([assignment]);
    (api.activeSession as jest.Mock).mockResolvedValue({
      id: "s1",
      zoneId: "z1",
      userId: "u1",
      vehicleId: "v1",
      entryEventId: "e1",
      exitEventId: null,
      enteredAt: new Date(Date.now() - 60_000).toISOString(),
      exitedAt: null,
      durationSeconds: null,
      feeAmount: null,
      status: "ACTIVE",
      zone: { id: "z1", name: "Zone A", code: "A" },
      vehicle: { id: "v1", plateNumber: "ABC-1234", vehicleType: "CAR" },
      entryEvent: null,
      exitEvent: null,
    });
    renderWithProviders(<ParkingScreen />);
    await waitFor(() => expect(screen.getByTestId("active-banner")).toBeOnTheScreen());
    expect(screen.queryByTestId("assignment-cancel")).toBeNull();
  });
});

describe("zone directions use the zone's own coordinates", () => {
  it("resolves only from navigationLat/navigationLng; never from names, the campus or the user", () => {
    expect(resolveZoneDestination(zones[0])).toEqual({ label: "Zone A", latitude: 13.76447, longitude: 121.06462 });
    expect(resolveZoneDestination(zones[1])).toBeNull();
    expect(resolveZoneDestination({ name: "X", navigationLat: 91, navigationLng: 0 })).toBeNull();
    expect(resolveZoneDestination({ name: "X", navigationLat: 0, navigationLng: 181 })).toBeNull();
    expect(resolveZoneDestination({ name: "X", navigationLat: Number.NaN, navigationLng: 1 })).toBeNull();
    expect(resolveZoneDestination(null)).toBeNull();
  });

  it("explains missing coordinates on the parking screen instead of fabricating a destination", async () => {
    (api.assignments as jest.Mock).mockResolvedValue([{ ...assignment, zoneId: "z2", zone: { id: "z2", name: "Zone B", code: "B" } }]);
    renderWithProviders(<ParkingScreen />);
    await waitFor(() => expect(screen.getByTestId("assignment-navigate")).toBeOnTheScreen());
    expect(screen.getByTestId("assignment-navigate")).toBeDisabled();
    expect(screen.getByTestId("assignment-navigate-unavailable")).toHaveTextContent(/haven't been configured yet/);
  });

  it("opens the platform map with the assigned zone's exact coordinates", async () => {
    jest.spyOn(Linking, "canOpenURL").mockResolvedValue(true);
    const openSpy = jest.spyOn(Linking, "openURL").mockResolvedValue(true as never);
    const LocationMock = jest.requireMock("expo-location") as {
      __setPermission: (r: { granted: boolean; canAskAgain: boolean }) => void;
      __setPosition: (c: { latitude: number; longitude: number }) => void;
    };
    LocationMock.__setPermission({ granted: true, canAskAgain: true });
    LocationMock.__setPosition({ latitude: 13.75, longitude: 121.05 });
    (api.assignments as jest.Mock).mockResolvedValue([assignment]);
    renderWithProviders(<ParkingScreen />);
    await waitFor(() => expect(screen.getByTestId("assignment-navigate")).toBeOnTheScreen());
    fireEvent.press(screen.getByTestId("assignment-navigate"));
    await waitFor(() => expect(openSpy).toHaveBeenCalledWith(expect.stringContaining("daddr=13.76447,121.06462")));
  });
});
