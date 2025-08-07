import React from 'react';

export default function OpenSourceAttribution() {
  return (
    <div className="p-8 max-w-3xl mx-auto text-center">
      <h1 className="text-3xl font-bold mb-4 dark:text-white">Open Source Attribution</h1>
      
      <p className="mb-6 dark:text-gray-300">
        This application uses open-source components. Below are the details of the third-party libraries:
      </p>

      <div className="bg-gray-100 dark:bg-gray-800 p-6 rounded-xl shadow-md text-left border border-gray-200 dark:border-gray-700">
        <h2 className="text-xl font-semibold mb-2 dark:text-white">VibeKit</h2>
        <p className="mb-2 dark:text-gray-300">License: MIT License</p>
        <p className="text-sm mb-4 dark:text-gray-400">
          Copyright (c) 2024 VibeKit Contributors
        </p>
        <p className="text-xs leading-relaxed dark:text-gray-400">
          Permission is hereby granted, free of charge, to any person obtaining a copy
          of this software and associated documentation files (the &quot;Software&quot;), to deal
          in the Software without restriction, including without limitation the rights
          to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
          copies of the Software, and to permit persons to whom the Software is
          furnished to do so, subject to the following conditions:
          <br /><br />
          The above copyright notice and this permission notice shall be included in all
          copies or substantial portions of the Software.
        </p>
      </div>
    </div>
  );
} 