import { redirect } from "next/navigation";

// /documents → redirect to home page
const DocumentsPage = () => {
  redirect("/");
};

export default DocumentsPage;