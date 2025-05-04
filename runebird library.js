/**
 * Runebind.js - Interpreter/Runtime Library
 * Version: 0.2.1 (Fixing Parsing Bug)
 *
 * Parses a simplified Runebind syntax (string) and renders it into a target DOM element.
 *
 * Enhancements in v0.2.0:
 * - Support for top-level 'components:' section to define reusable element structures.
 * - Support for top-level 'variables:' section for simple key-value variable substitution.
 * - Support for top-level 'styles:' section to define CSS rules and apply via 'class'.
 * - Basic variable substitution using {{variableName}} syntax in text and attributes.
 * - Improved parsing to handle top-level sections (page, components, variables, styles).
 *
 * Bug Fix in v0.2.1:
 * - Corrected parsing logic in `parseLines` to properly handle indentation and stack management,
 * resolving the "Cannot set properties of null" error during element creation.
 *
 * Limitations (Still Conceptual):
 * - Parsing is still relatively basic (line-by-line, indentation-based).
 * - Variable substitution is simple (string replacement), no complex expressions.
 * - Component parameters/props are not supported in this version.
 * - CSS support is basic (simple rules, no nesting or advanced features).
 * - Minimal error handling for new features.
 */
const Runebind = {
    // Stores parsed components, variables, and styles
    definitions: {
        page: null,
        components: {},
        variables: {},
        styles: {}
    },

    /**
     * Parses the Runebind string and renders it into the target DOM element.
     * @param {string} runebindString The Runebind code as a string.
     * @param {HTMLElement} targetElement The DOM element to render into.
     */
    render: function(runebindString, targetElement) {
        if (!targetElement) {
            console.error("Runebind Error: Target element not provided.");
            return;
        }
        targetElement.innerHTML = ''; // Clear previous content

        try {
            const lines = runebindString.trim().split('\n');
            // Parse the entire string into the definitions object
            this.definitions = this.parseLines(lines);

            // Check if a 'page' definition exists
            if (!this.definitions.page) {
                console.error("Runebind Error: No top-level 'page:' section defined.");
                targetElement.innerHTML = `<pre style="color: red;">Runebind Error:\nNo top-level 'page:' section defined.</pre>`;
                return;
            }

            // Apply global styles if defined
            if (Object.keys(this.definitions.styles).length > 0) {
                 const styleTag = document.createElement('style');
                 styleTag.textContent = this.generateCss(this.definitions.styles);
                 document.head.appendChild(styleTag); // Append styles to head
            }

            // Create and append the root element from the 'page' definition
            // The page definition is expected to be a single object like { rootElementName: { ... } }
            const rootElement = this.createElement(this.definitions.page);


            if (rootElement) {
                targetElement.appendChild(rootElement);
            } else {
                 console.error("Runebind Error: Failed to create root element from 'page' definition.");
                 targetElement.innerHTML = `<pre style="color: red;">Runebind Error:\nFailed to create root element from 'page' definition.</pre>`;
            }

        } catch (error) {
            console.error("Runebind Parsing/Rendering Error:", error);
            targetElement.innerHTML = `<pre style="color: red;">Runebind Error:\n${error.message}\n${error.stack}</pre>`;
        }
    },

    /**
     * Parses lines into a nested JavaScript object structure, handling top-level sections.
     * @param {string[]} lines - Array of lines from the Runebind string.
     * @returns {object} An object containing parsed sections (page, components, variables, styles).
     */
    parseLines: function(lines) {
        const result = {
            page: null,
            components: {},
            variables: {},
            styles: {}
        };
        // Stack stores objects representing the current parsing context { level: number, obj: object/array }
        const stack = [{ level: -1, obj: result }];

        lines.forEach((line, index) => {
            if (line.trim() === '' || line.trim().startsWith('#')) return; // Skip empty lines and comments

            const indentation = line.match(/^\s*/)[0].length;
            const content = line.trim();
            const lineNumber = index + 1;

            // Pop elements from stack until correct indentation level is found
            // Keep popping as long as the current line's indentation is NOT greater than the top of the stack's level
            while (stack.length > 1 && indentation <= stack[stack.length - 1].level) {
                stack.pop();
            }

             // Check for indentation errors (should not pop off the root)
             if (stack.length === 0) {
                 console.error(`Runebind Parser Error (Line ${lineNumber}): Indentation error. Cannot find parent context.`);
                 throw new Error(`Runebind Parser Error (Line ${lineNumber}): Indentation error.`);
             }

            const parentContext = stack[stack.length - 1];
            const parentObj = parentContext.obj;
            const parentLevel = parentContext.level;

            // --- Handle Array Items (children, or items within styles/variables arrays) ---
            if (content.startsWith('-')) {
                 if (!Array.isArray(parentObj)) {
                    // This indicates a '-' line where the parent object isn't an array (like 'children:')
                     console.warn(`Runebind Parser Warning (Line ${lineNumber}): Found array item '-' without an array parent. Line: "${line}"`);
                     return; // Skip malformed lines
                 }
                 const itemContent = content.substring(1).trim();
                 const colonIndex = itemContent.indexOf(':');

                 if (colonIndex > 0) {
                     // It's an object within the array (e.g., a child element definition: - elementName:)
                     const key = itemContent.substring(0, colonIndex).trim();
                     const newObj = {};
                     parentObj.push({ [key]: newObj }); // Add named object to array
                     stack.push({ level: indentation, obj: newObj }); // Push the new object onto the stack
                 } else {
                     // Simple value in array (less common for element structures, more for lists of values)
                     parentObj.push(this.parseValue(itemContent));
                 }
            }
            // --- Handle Key-Value Pairs or Section Definitions ---
            else {
                const colonIndex = content.indexOf(':');
                if (colonIndex <= 0) {
                     console.warn(`Runebind Parser Warning (Line ${lineNumber}): Invalid format. Expected 'key: value' or section definition. Line: "${line}"`);
                     return; // Skip malformed lines
                }

                const key = content.substring(0, colonIndex).trim();
                const valuePart = content.substring(colonIndex + 1).trim();

                // Handle top-level sections (only allowed at level -1)
                if (parentLevel === -1) {
                     if (key === 'page' || key === 'components' || key === 'variables' || key === 'styles') {
                         if (valuePart !== '') {
                             console.warn(`Runebind Parser Warning (Line ${lineNumber}): Top-level section '${key}' should not have a value on the same line. Ignoring value: "${valuePart}"`);
                         }
                         // The object for this section is already in `result`
                         // Push the specific section object onto the stack
                         stack.push({ level: indentation, obj: result[key] });
                     } else {
                         console.warn(`Runebind Parser Warning (Line ${lineNumber}): Unknown top-level section '${key}'. Ignoring.`);
                         // Do NOT push onto stack for unknown top-level keys
                     }
                } else if (valuePart === '') {
                    // It's an object or array definition (like style: or children:)
                    // Ensure the parent is an object where we can add a key
                     if (typeof parentObj !== 'object' || parentObj === null || Array.isArray(parentObj)) {
                         console.warn(`Runebind Parser Warning (Line ${lineNumber}): Cannot define nested object/array under a non-object or array parent. Line: "${line}"`);
                         return; // Skip malformed structure
                     }

                    if (key === 'children') {
                        const newArr = [];
                        parentObj[key] = newArr;
                        stack.push({ level: indentation, obj: newArr }); // Push the ARRAY onto the stack
                    } else { // Assumed to be an object (like 'style:', component definition, variable object, style rule block)
                         const newObj = {};
                         parentObj[key] = newObj;
                         stack.push({ level: indentation, obj: newObj }); // Push the OBJECT onto the stack
                    }
                } else {
                    // It's a simple key-value pair
                    // Ensure the parent is an object where we can add a key
                     if (typeof parentObj !== 'object' || parentObj === null || Array.isArray(parentObj)) {
                          console.warn(`Runebind Parser Warning (Line ${lineNumber}): Cannot define key-value pair directly inside a non-object or array parent. Line: "${line}"`);
                          return; // Skip malformed structure
                     }
                    parentObj[key] = this.parseValue(valuePart);
                }
            }
        });

        return result; // Return the object containing all parsed sections
    },

    /**
     * Parses a value string into appropriate JS type (basic) and performs variable substitution.
     * @param {string} valueString - The string value part.
     * @returns {string | number | boolean} Parsed value with variables substituted.
     */
    parseValue: function(valueString) {
        let value = valueString.trim();

        // Trim quotes if present (basic)
        if ((value.startsWith("'") && value.endsWith("'")) ||
            (value.startsWith('"') && value.endsWith('"'))) {
            value = value.slice(1, -1);
        }

        // Perform variable substitution
        value = value.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
            const variableValue = this.definitions.variables[varName];
            if (variableValue !== undefined) {
                return variableValue;
            } else {
                console.warn(`Runebind Warning: Variable '{{${varName}}}' not found.`);
                return match; // Return original placeholder if variable not found
            }
        });

        // Basic number/boolean conversion (after substitution)
        const num = Number(value);
        if (!isNaN(num) && value !== '') return num;
        if (value === 'true') return true;
        if (value === 'false') return false;

        return value; // Default to string
    },

     /**
      * Generates a CSS string from the parsed styles object.
      * @param {object} stylesObject - The parsed styles definition.
      * @returns {string} A CSS string.
      */
     generateCss: function(stylesObject) {
         let cssString = '';
         for (const selector in stylesObject) {
             if (stylesObject.hasOwnProperty(selector)) {
                 const rules = stylesObject[selector];
                 cssString += `${selector} {\n`;
                 for (const property in rules) {
                     if (rules.hasOwnProperty(property)) {
                         // Convert camelCase to kebab-case for CSS properties
                         const cssProperty = property.replace(/([A-Z])/g, (g) => `-${g[0].toLowerCase()}`);
                         // Apply variable substitution to CSS values
                         cssString += `  ${cssProperty}: ${this.parseValue(String(rules[property]))};\n`;
                     }
                 }
                 cssString += `}\n\n`;
             }
         }
         return cssString;
     },

    /**
     * Creates a DOM element based on its Runebind definition object.
     * Handles standard elements and component instances.
     * @param {object} definition - The object describing the element or component instance.
     * @returns {HTMLElement | null} The created DOM element or null on failure.
     */
    createElement: function(definition) {
        // A definition object is typically { elementName: { properties... } }
        const elementKey = Object.keys(definition)[0];
        const elementDefinition = definition[elementKey];

        if (!elementDefinition || typeof elementDefinition !== 'object') {
             console.error("Runebind Error: Invalid element definition structure:", definition);
             return null;
        }

        let tagName = elementDefinition.element;
        let actualDefinition = elementDefinition; // The definition we will use to build the element

        // --- Check if it's a Component Instance ---
        if (!tagName && this.definitions.components[elementKey]) {
            // The key matches a component name, and no 'element' tag is specified
            console.log(`Runebind: Rendering component instance: ${elementKey}`);
            // Get the component definition
            const componentDef = this.definitions.components[elementKey];
            // Use the component's root element tag
            tagName = componentDef.element || 'div'; // Component must have a root element or default to div
            if (!componentDef.element) {
                 console.warn(`Runebind Warning: Component '${elementKey}' does not specify a root 'element:'. Defaulting to 'div'.`);
            }
            // Use the component's definition as the basis
            actualDefinition = componentDef;
            // Note: This simple implementation doesn't handle component-specific overrides or props.
            // A more advanced version would merge elementDefinition properties from the instance
            // into the component's actualDefinition before processing.
        } else if (!tagName) {
             // It's not a known component and has no 'element' tag
             console.warn(`Runebind Warning: Element key '${elementKey}' has no 'element:' tag and is not a defined component. Defaulting to 'div'.`);
             tagName = 'div'; // Default to div if no element tag and not a component
        }


        if (typeof tagName !== 'string' || !/^[a-zA-Z][a-zA-Z0-9-]*$/.test(tagName)) {
             console.error(`Runebind Error: Invalid or missing tag name '${tagName}' for element '${elementKey}'.`);
             return null; // Return null for invalid tag names
         }

        const element = document.createElement(tagName);

        // Process properties from the actual definition (component or standard element)
        for (const key in actualDefinition) {
            if (!actualDefinition.hasOwnProperty(key) || key === 'element') continue; // Skip 'element' as it's handled

            const value = actualDefinition[key];

            switch (key) {
                case 'text':
                    // Apply variable substitution to text content
                    element.textContent = this.parseValue(String(value));
                    break;
                case 'style':
                    if (typeof value === 'object' && value !== null) {
                        Object.assign(element.style, value); // Apply inline styles
                    } else {
                        console.warn(`Runebind Warning: 'style' property value for element '${elementKey}' is not an object:`, value);
                    }
                    break;
                 case 'class':
                     // Apply CSS classes
                     if (typeof value === 'string') {
                         element.className = value; // Simple class assignment
                     } else {
                          console.warn(`Runebind Warning: 'class' property value for element '${elementKey}' is not a string:`, value);
                     }
                     break;
                case 'children':
                    if (Array.isArray(value)) {
                        value.forEach((childDef, index) => {
                             if (typeof childDef !== 'object' || childDef === null || Object.keys(childDef).length !== 1) {
                                 console.warn(`Runebind Warning: Invalid child definition at index ${index} under element '${elementKey}':`, childDef);
                                 return; // Skip invalid child definition
                             }
                            const childElement = this.createElement(childDef); // Recursively create child
                            if (childElement) {
                                element.appendChild(childElement);
                            } else {
                                 console.warn(`Runebind Warning: Failed to create child element at index ${index} under element '${elementKey}'.`);
                            }
                        });
                    } else {
                         console.warn(`Runebind Warning: 'children' property value for element '${elementKey}' is not an array:`, value);
                    }
                    break;
                default:
                    // Handle standard HTML attributes and event handlers
                    if (key.startsWith('on') && typeof value === 'string') {
                        // Event handler (e.g., onClick)
                        const eventName = key.toLowerCase().substring(2); // e.g., click
                        try {
                            // Use addEventListener for better practice
                            // 'this' inside the handler string will refer to the element
                            element.addEventListener(eventName, function(event) {
                                new Function('event', value).call(this, event);
                            });
                        } catch (e) {
                            console.error(`Runebind Error: Invalid JavaScript in event handler '${key}' for element '${elementKey}':`, value, e);
                        }
                    } else if (value !== null && value !== undefined) {
                        // Standard HTML attribute - apply variable substitution
                        element.setAttribute(key, this.parseValue(String(value)));
                    }
                    break;
            }
        }

        return element;
    }
};
