"use client";

import dynamic from "next/dynamic";

const TaskClientPage = dynamic(() => import("./client-page"), {
  ssr: false,
});

interface Props {
  id: string;
}

export default function DynamicTaskClientPage({ id }: Props) {
  return <TaskClientPage id={id} />;
}