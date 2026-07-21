import React, { useState } from "react";
import { X, Maximize2, Minimize2 } from "lucide-react";

export default function ReferenceSheet({ url, onClose }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={`absolute z-40 bg-white border border-slate-300 shadow-2xl rounded-lg overflow-hidden flex flex-col transition-all duration-200 ${
        expanded
          ? "inset-4"
          : "top-14 right-4 w-[480px] h-[560px]"
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-800 text-white flex-shrink-0">
        <span className="font-semibold text-sm">Reference Sheet</span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1 hover:bg-white/10 rounded"
          >
            {expanded ? (
              <Minimize2 className="w-4 h-4" />
            ) : (
              <Maximize2 className="w-4 h-4" />
            )}
          </button>
          <button
            onClick={onClose}
            className="p-1 hover:bg-white/10 rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto bg-white">
        {url ? (
          url.toLowerCase().endsWith(".pdf") ? (
            <iframe
              src={url}
              className="w-full h-full border-0"
              title="Reference Sheet"
            />
          ) : (
            <img
              src={url}
              alt="Reference Sheet"
              className="w-full object-contain"
            />
          )
        ) : (
          /* Built-in AP CSA 2026 Java Quick Reference */
          <div className="p-5 text-xs">
            <h2 className="font-bold text-sm mb-1 text-blue-700">Java Quick Reference</h2>
            <p className="text-slate-500 mb-4 text-xs">This table contains accessible methods from the Java library that may be included on the AP Computer Science A Exam.</p>

            {[
              {
                title: "String Class",
                rows: [
                  ["String(String str)", "Constructs a new String object that represents the same sequence of characters as str"],
                  ["int length()", "Returns the number of characters in a String object"],
                  ["String substring(int from, int to)", "Returns the substring beginning at index from and ending at index to – 1"],
                  ["String substring(int from)", "Returns substring(from, length())"],
                  ["int indexOf(String str)", "Returns the index of the first occurrence of str; returns -1 if not found"],
                  ["boolean equals(Object other)", "Returns true if this corresponds to the same sequence of characters as other; returns false otherwise"],
                  ["int compareTo(String other)", "Returns a value < 0 if this is less than other; returns zero if this is equal to other; returns a value > 0 if this is greater than other. Strings are ordered based upon the alphabet."],
                  ["String[] split(String del)", "Returns a String array where each element is a substring of this String, which has been split around matches of the given expression del"],
                ]
              },
              {
                title: "Integer Class",
                rows: [
                  ["Integer.MIN_VALUE", "The minimum value represented by an int or Integer"],
                  ["Integer.MAX_VALUE", "The maximum value represented by an int or Integer"],
                  ["static int parseInt(String s)", "Returns the String argument as an int"],
                ]
              },
              {
                title: "Double Class",
                rows: [
                  ["static double parseDouble(String s)", "Returns the String argument as a double"],
                ]
              },
              {
                title: "Math Class",
                rows: [
                  ["static int abs(int x)", "Returns the absolute value of an int value"],
                  ["static double abs(double x)", "Returns the absolute value of a double value"],
                  ["static double pow(double base, double exponent)", "Returns the value of the first parameter raised to the power of the second parameter"],
                  ["static double sqrt(double x)", "Returns the nonnegative square root of a double value"],
                  ["static double random()", "Returns a double value greater than or equal to 0.0 and less than 1.0"],
                ]
              },
              {
                title: "ArrayList Class",
                rows: [
                  ["int size()", "Returns the number of elements in the list"],
                  ["boolean add(E obj)", "Appends obj to end of list; returns true"],
                  ["void add(int index, E obj)", "Inserts obj at position index (0 <= index <= size), moving elements at position index and higher to the right (adds 1 to their indices) and adds 1 to size"],
                  ["E get(int index)", "Returns the element at position index in the list"],
                  ["E set(int index, E obj)", "Replaces the element at position index with obj; returns the element formerly at position index"],
                  ["E remove(int index)", "Removes element from position index, moving elements at position index + 1 and higher to the left (subtracts 1 from their indices) and subtracts 1 from size; returns the element formerly at position index"],
                ]
              },
              {
                title: "File Class",
                rows: [
                  ["File(String pathname)", "The File constructor that accepts a String pathname"],
                ]
              },
              {
                title: "Scanner Class",
                rows: [
                  ["Scanner(File f)", "The Scanner constructor that accepts a File for reading"],
                  ["int nextInt()", "Returns the next int read from the file or input source if available. If the next int does not exist or is out of range, it will result in an InputMismatchException."],
                  ["double nextDouble()", "Returns the next double read from the file or input source. If the next double does not exist, it will result in an InputMismatchException."],
                  ["boolean nextBoolean()", "Returns the next boolean read from the file or input source. If the next boolean does not exist, it will result in an InputMismatchException."],
                  ["String nextLine()", "Returns the next line of text as a String read from the file or input source; can return the empty string if called immediately after another Scanner method"],
                  ["String next()", "Returns the next String read from the file or input source"],
                  ["boolean hasNext()", "Returns true if there is a next item to read in the file or input source; false otherwise"],
                  ["void close()", "Closes this scanner"],
                ]
              },
              {
                title: "Object Class",
                rows: [
                  ["boolean equals(Object other)", ""],
                  ["String toString()", ""],
                ]
              },
            ].map(({ title, rows }) => (
              <section key={title} className="mb-5">
                <h3 className="font-bold text-blue-700 text-xs text-center bg-blue-50 border border-blue-200 py-1 mb-0">{title}</h3>
                <table className="w-full border-collapse">
                  <tbody>
                    {rows.map(([method, desc]) => (
                      <tr key={method} className="even:bg-slate-50">
                        <td className="border border-slate-300 px-2 py-1.5 font-mono text-xs align-top w-[45%] whitespace-pre-wrap">{method}</td>
                        {desc && <td className="border border-slate-300 px-2 py-1.5 align-top leading-relaxed">{desc}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}