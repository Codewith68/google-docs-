import { SignIn } from "@clerk/nextjs";

export default function Page() {
  return (
    <div className="flex flex-1 items-center justify-center bg-[#FAFBFD]">
      <SignIn routing="path" path="/sign-in" />
    </div>
  );
}
