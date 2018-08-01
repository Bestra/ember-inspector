export interface InspectedNodeValue {
  isComponent: boolean;
  objectId: any;
  name: string;
  renderNodeId: number;
}

export interface Message {
  objectId: any,
  elementId: any,
  renderNodeId: any,
}

export interface InspectMessage {
  inspect: boolean,
}

