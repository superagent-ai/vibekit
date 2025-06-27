"use client";

import Navbar from "@/components/navbar";
import TaskList from "./_components/task-list";
import TaskForm from "./_components/task-form";

export default function ClientPage() {
  return (
    <div className="flex flex-col px-4 py-2 h-screen gap-y-4">
      <Navbar />
      <TaskForm />
      <TaskList />
    </div>
  );
}