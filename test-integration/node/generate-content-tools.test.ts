/**
 * @license
 * Copyright 2024 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { expect, use } from "chai";
import * as chaiAsPromised from "chai-as-promised";
import { GoogleGenerativeAI, SchemaType } from "../..";
import { Content } from "../../types";

use(chaiAsPromised);

/**
 * Integration tests against live backend.
 */

describe("generateContent - tools", function () {
  this.timeout(60e3);
  this.slow(10e3);
  // This test can be flaky
  // eslint-disable-next-line no-restricted-properties
  it("non-streaming, tools usage", async () => {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-pro-latest",
      tools: [
        {
          functionDeclarations: [
            {
              name: "find_movies",
              description:
                "find movie titles currently playing in theaters based on any description, genre, title words, etc.",
              parameters: {
                type: SchemaType.OBJECT,
                properties: {
                  location: {
                    type: SchemaType.STRING,
                    description: "The city and state, e.g. San Francisco, CA",
                  },
                  description: {
                    type: SchemaType.STRING,
                    description:
                      "Any kind of description including category or genre, title words, attributes, etc.",
                  },
                },
                required: ["description"],
              },
            },
            {
              name: "find_theaters",
              description:
                "find theaters based on location and optionally movie title which are is currently playing in theaters",
              parameters: {
                type: SchemaType.OBJECT,
                properties: {
                  location: {
                    type: SchemaType.STRING,
                    description: "The city and state, e.g. San Francisco, CA",
                  },
                  movie: {
                    type: SchemaType.STRING,
                    description: "Any movie title",
                  },
                },
                required: ["location"],
              },
            },
            {
              name: "get_showtimes",
              description:
                "Find the start times for movies playing in a specific theater",
              parameters: {
                type: SchemaType.OBJECT,
                properties: {
                  location: {
                    type: SchemaType.STRING,
                    description: "The city and state, e.g. San Francisco, CA",
                  },
                  movie: {
                    type: SchemaType.STRING,
                    description: "Any movie title",
                  },
                  theater: {
                    type: SchemaType.STRING,
                    description: "Name of the theater",
                  },
                  date: {
                    type: SchemaType.STRING,
                    description: "Date for requested showtime",
                  },
                },
                required: ["location", "movie", "theater", "date"],
              },
            },
          ],
        },
      ],
    });

    const src1 = {
      role: "user",
      parts: [
        {
          text: "Which theaters in Mountain View show Barbie movie?",
        },
      ],
    };
    const exp1 = {
      role: "model",
      parts: [
        {
          functionCall: {
            name: "find_theaters",
            args: {
              location: "Mountain View, CA",
              movie: "Barbie",
            },
          },
        },
      ],
    };

    const src2 = {
      role: "function",
      parts: [
        {
          functionResponse: {
            name: "find_theaters",
            response: {
              name: "find_theaters",
              content: {
                movie: "Barbie",
                theaters: [
                  {
                    name: "AMC Mountain View 16",
                    address: "2000 W El Camino Real, Mountain View, CA 94040",
                  },
                  {
                    name: "Regal Edwards 14",
                    address: "245 Castro St, Mountain View, CA 94040",
                  },
                ],
              },
            },
          },
        },
      ],
    };

    const result1 = await model.generateContentStream({
      contents: [src1],
    });
    const response1 = await result1.response;
    expect(response1.candidates.length).to.equal(1);
    expect(response1.candidates[0].content.role).to.equal("model");
    expect(response1.candidates[0].content.parts.length).to.equal(1);
    expect(response1.candidates[0].content).to.deep.equal(exp1);

    const result3 = await model.generateContent({
      contents: [src1, exp1, src2],
    });
    const response3 = result3.response;
    expect(response3.text()).include("AMC Mountain View 16");
    expect(response3.text()).include("Regal Edwards 14");
  });
  it("streaming, tools usage", async () => {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-pro-latest",
      tools: [
        {
          functionDeclarations: [
            {
              name: "getTemperature",
              description:
                "Get current temperature in degrees Celsius in a given city",
              parameters: {
                type: SchemaType.OBJECT,
                properties: {
                  city: { type: SchemaType.STRING },
                },
                required: ["city"],
              },
            },
          ],
        },
      ],
    });

    const src1: Content = {
      role: "user",
      parts: [
        {
          text: "Is the temperature the same in New York and San Jose right now?",
        },
      ],
    };
    const src2: Content = {
      role: "model",
      parts: [
        {
          functionCall: {
            name: "getTemperature",
            args: { city: "New York" },
          },
        },
      ],
    };
    const src3: Content = {
      role: "model",
      parts: [
        {
          functionCall: {
            name: "getTemperature",
            args: { city: "San Jose" },
          },
        },
      ],
    };
    const fn1 = {
      role: "function",
      parts: [
        {
          functionResponse: {
            name: "getTemperature",
            response: {
              name: "getTemperature",
              content: {
                temperature: "30",
              },
            },
          },
        },
      ],
    };

    const result = await model.generateContentStream({
      contents: [src1, src2, fn1, src3, fn1],
    });
    const response = await result.response;
    expect(response.text()).to.match(/(\bsame\b|\byes\b)/i);
  });
});
