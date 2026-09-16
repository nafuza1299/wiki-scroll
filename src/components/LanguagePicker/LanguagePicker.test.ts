import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/vue";
import userEvent from "@testing-library/user-event";
import LanguagePicker from "./LanguagePicker.vue";
import { LANGUAGES } from "../../lib/wikipedia/languages";

describe("LanguagePicker", () => {
  it("shows the current language as selected", () => {
    render(LanguagePicker, { props: { modelValue: "fr" } });

    expect(screen.getByLabelText("Wikipedia language")).toHaveValue("fr");
  });

  it("lists every supported language as an option", () => {
    render(LanguagePicker, { props: { modelValue: "en" } });

    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(LANGUAGES.length);
    expect(options.map((option) => (option as HTMLOptionElement).value)).toEqual(
      LANGUAGES.map((language) => language.code),
    );
  });

  it("emits the chosen code on selection", async () => {
    const { emitted } = render(LanguagePicker, { props: { modelValue: "en" } });

    await userEvent.selectOptions(screen.getByLabelText("Wikipedia language"), "de");

    expect(emitted()["update:modelValue"]).toEqual([["de"]]);
  });

  /*
    Controlled, not self-managing: the select must reflect whatever modelValue
    the caller passes, including a change that didn't originate from a click on
    this control at all (e.g. a shared link setting ?lang= directly).
  */
  it("updates when modelValue changes from outside", async () => {
    const { rerender } = render(LanguagePicker, { props: { modelValue: "en" } });

    await rerender({ modelValue: "ja" });

    expect(screen.getByLabelText("Wikipedia language")).toHaveValue("ja");
  });
});
