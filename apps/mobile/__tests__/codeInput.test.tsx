import { render, screen, fireEvent } from "@/src/test/utils";
import { CodeInput } from "@/src/components";

describe("CodeInput", () => {
  it("mirrors the typed digits into boxes and keeps one real, labelled field", async () => {
    const onChange = jest.fn();
    await render(<CodeInput label="Verification code" value="482" onChangeText={onChange} testID="code" />);
    expect(screen.getByText("4")).toBeOnTheScreen();
    expect(screen.getByText("8")).toBeOnTheScreen();
    expect(screen.getByText("2")).toBeOnTheScreen();
    const field = screen.getByTestId("code");
    expect(field).toHaveProp("accessibilityLabel", "Verification code");
    expect(field).toHaveProp("maxLength", 6);
    await fireEvent.changeText(field, "4829");
    expect(onChange).toHaveBeenCalledWith("4829");
  });

  it("shows the hint under the boxes", async () => {
    await render(<CodeInput label="Verification code" value="" onChangeText={jest.fn()} hint="Codes expire after 10 minutes." />);
    expect(screen.getByText("Codes expire after 10 minutes.")).toBeOnTheScreen();
  });
});
